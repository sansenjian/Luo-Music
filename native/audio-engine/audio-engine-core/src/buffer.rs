use std::collections::VecDeque;
use std::sync::{Mutex, MutexGuard};

#[derive(Debug)]
pub struct StreamingPcmBuffer {
    inner: Mutex<StreamingPcmBufferState>,
}

#[derive(Debug)]
struct StreamingPcmBufferState {
    samples: VecDeque<f32>,
    capacity_samples: usize,
    closed: bool,
}

impl StreamingPcmBuffer {
    pub fn with_capacity(capacity_samples: usize) -> Self {
        Self {
            inner: Mutex::new(StreamingPcmBufferState {
                samples: VecDeque::with_capacity(capacity_samples.max(1)),
                capacity_samples: capacity_samples.max(1),
                closed: false,
            }),
        }
    }

    pub fn push_samples(&self, samples: &[f32]) -> usize {
        if samples.is_empty() {
            return 0;
        }

        let mut state = self.lock_state();
        if state.closed {
            return 0;
        }

        let writable = state.capacity_samples.saturating_sub(state.samples.len());
        let write_count = writable.min(samples.len());
        state
            .samples
            .extend(samples.iter().take(write_count).copied());
        write_count
    }

    pub fn pop_samples(&self, output: &mut [f32]) -> usize {
        if output.is_empty() {
            return 0;
        }

        let mut state = self.lock_state();
        let mut read_count = 0usize;
        for slot in output.iter_mut() {
            let Some(sample) = state.samples.pop_front() else {
                break;
            };

            *slot = sample;
            read_count += 1;
        }

        read_count
    }

    pub fn pop_exact_samples(&self, output: &mut [f32]) -> bool {
        if output.is_empty() {
            return true;
        }

        let mut state = self.lock_state();
        if state.samples.len() < output.len() {
            return false;
        }

        for slot in output.iter_mut() {
            *slot = state
                .samples
                .pop_front()
                .expect("buffer length was checked before pop");
        }

        true
    }

    pub fn close(&self) {
        self.lock_state().closed = true;
    }

    pub fn buffered_samples(&self) -> usize {
        self.lock_state().samples.len()
    }

    pub fn is_closed_and_empty(&self) -> bool {
        let state = self.lock_state();
        state.closed && state.samples.is_empty()
    }

    fn lock_state(&self) -> MutexGuard<'_, StreamingPcmBufferState> {
        self.inner.lock().unwrap_or_else(|error| error.into_inner())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamingPcmRenderStatus {
    Playing,
    Underrun,
    Ended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StreamingPcmFrameRead {
    Ready,
    Underrun,
    Ended,
}

pub struct StreamingPcmRenderState {
    source_channels: usize,
    output_channels: usize,
    frame_step: f64,
    source_frame_position: f64,
    consumed_source_frames: usize,
    current_frame: Vec<f32>,
}

impl StreamingPcmRenderState {
    pub fn new(
        source_sample_rate: u32,
        output_sample_rate: u32,
        source_channels: usize,
        output_channels: usize,
    ) -> Self {
        let source_channels = source_channels.max(1);
        Self {
            source_channels,
            output_channels: output_channels.max(1),
            frame_step: source_sample_rate.max(1) as f64 / output_sample_rate.max(1) as f64,
            source_frame_position: 0.0,
            consumed_source_frames: 0,
            current_frame: vec![0.0; source_channels],
        }
    }

    pub fn fill_output(
        &mut self,
        buffer: &StreamingPcmBuffer,
        output: &mut [f32],
        volume: f32,
    ) -> StreamingPcmRenderStatus {
        let volume = volume.clamp(0.0, 1.0);
        let mut status = StreamingPcmRenderStatus::Playing;

        for frame in output.chunks_mut(self.output_channels) {
            let source_frame_index = self.source_frame_position.floor().max(0.0) as usize;
            match self.ensure_source_frame(buffer, source_frame_index) {
                StreamingPcmFrameRead::Ready => {
                    for (channel_index, sample) in frame.iter_mut().enumerate() {
                        let source_channel = if self.source_channels == 1 {
                            0
                        } else {
                            channel_index.min(self.source_channels - 1)
                        };
                        *sample = self.current_frame[source_channel] * volume;
                    }
                    self.source_frame_position += self.frame_step;
                }
                StreamingPcmFrameRead::Underrun => {
                    frame.fill(0.0);
                    if status == StreamingPcmRenderStatus::Playing {
                        status = StreamingPcmRenderStatus::Underrun;
                    }
                }
                StreamingPcmFrameRead::Ended => {
                    frame.fill(0.0);
                    status = StreamingPcmRenderStatus::Ended;
                }
            }
        }

        status
    }

    fn ensure_source_frame(
        &mut self,
        buffer: &StreamingPcmBuffer,
        target_frame_index: usize,
    ) -> StreamingPcmFrameRead {
        while self.consumed_source_frames <= target_frame_index {
            let mut next_frame = vec![0.0; self.source_channels];
            if buffer.pop_exact_samples(&mut next_frame) {
                self.current_frame = next_frame;
                self.consumed_source_frames += 1;
                continue;
            }

            if buffer.is_closed_and_empty() {
                return StreamingPcmFrameRead::Ended;
            }

            return StreamingPcmFrameRead::Underrun;
        }

        StreamingPcmFrameRead::Ready
    }

    pub fn cursor_samples(&self) -> usize {
        (self.source_frame_position.floor().max(0.0) as usize).saturating_mul(self.source_channels)
    }
}

#[cfg(test)]
mod tests {
    use super::{StreamingPcmBuffer, StreamingPcmRenderState, StreamingPcmRenderStatus};

    #[test]
    fn buffer_preserves_order_and_capacity() {
        let buffer = StreamingPcmBuffer::with_capacity(3);

        assert_eq!(buffer.push_samples(&[0.1, 0.2, 0.3, 0.4]), 3);
        assert_eq!(buffer.buffered_samples(), 3);

        let mut output = [0.0; 4];
        assert_eq!(buffer.pop_samples(&mut output), 3);
        assert_eq!(output, [0.1, 0.2, 0.3, 0.0]);
    }

    #[test]
    fn render_state_maps_mono_to_stereo() {
        let buffer = StreamingPcmBuffer::with_capacity(2);
        buffer.push_samples(&[0.5, -0.25]);
        buffer.close();

        let mut render_state = StreamingPcmRenderState::new(48_000, 48_000, 1, 2);
        let mut output = [0.0; 4];

        assert_eq!(
            render_state.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Playing
        );
        assert_eq!(output, [0.5, 0.5, -0.25, -0.25]);
    }
}

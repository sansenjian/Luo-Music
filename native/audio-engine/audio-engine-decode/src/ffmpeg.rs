use anyhow::{anyhow, Context, Result};
use ffmpeg_next as ffmpeg;

use crate::{AudioDecoder, DecodedAudioFormat, DecodedF32Audio, DecodedSampleFormat};

pub struct FfmpegAudioDecoder {
    path: String,
    start_seconds: f64,
}

impl FfmpegAudioDecoder {
    pub fn open(path: impl Into<String>, start_seconds: f64) -> Result<Self> {
        ffmpeg::init().context("Failed to initialize FFmpeg.")?;
        Ok(Self {
            path: path.into(),
            start_seconds: start_seconds.max(0.0),
        })
    }
}

impl AudioDecoder for FfmpegAudioDecoder {
    fn decode_to_f32(self) -> Result<DecodedF32Audio> {
        decode_file_to_f32(&self.path, self.start_seconds)
    }
}

fn decode_file_to_f32(path: &str, start_seconds: f64) -> Result<DecodedF32Audio> {
    let mut input_context = ffmpeg::format::input(path)
        .with_context(|| format!("Failed to open with FFmpeg: {path}"))?;
    let input_stream = input_context
        .streams()
        .best(ffmpeg::media::Type::Audio)
        .context("FFmpeg could not find a playable audio stream.")?;
    let stream_index = input_stream.index();
    let codec_context = ffmpeg::codec::context::Context::from_parameters(input_stream.parameters())
        .context("Failed to create FFmpeg codec context.")?;
    let mut decoder = codec_context
        .decoder()
        .audio()
        .context("Failed to open FFmpeg audio decoder.")?;

    let sample_rate = decoder.rate();
    let channels = decoder.channels();
    if sample_rate == 0 || channels == 0 {
        return Err(anyhow!("FFmpeg audio stream metadata is incomplete."));
    }

    let channel_layout = resolve_channel_layout(decoder.channel_layout(), channels);
    let mut resampler = ffmpeg::software::resampling::Context::get(
        decoder.format(),
        channel_layout,
        sample_rate,
        ffmpeg::format::Sample::F32(ffmpeg::format::sample::Type::Packed),
        channel_layout,
        sample_rate,
    )
    .context("Failed to create FFmpeg f32 resampler.")?;

    let mut samples = Vec::new();
    let mut remaining_samples_to_skip =
        frame_index_for_seconds(start_seconds, sample_rate).saturating_mul(usize::from(channels));

    for (stream, packet) in input_context.packets() {
        if stream.index() != stream_index {
            continue;
        }

        decoder
            .send_packet(&packet)
            .context("Failed to send FFmpeg packet to decoder.")?;
        receive_resampled_frames(
            &mut decoder,
            &mut resampler,
            usize::from(channels),
            &mut remaining_samples_to_skip,
            &mut samples,
        )?;
    }

    decoder
        .send_eof()
        .context("Failed to send FFmpeg decoder EOF.")?;
    receive_resampled_frames(
        &mut decoder,
        &mut resampler,
        usize::from(channels),
        &mut remaining_samples_to_skip,
        &mut samples,
    )?;

    flush_resampler(
        &mut resampler,
        usize::from(channels),
        &mut remaining_samples_to_skip,
        &mut samples,
    )?;

    if samples.is_empty() {
        return Err(anyhow!(
            "FFmpeg decoded audio is empty after the requested start offset."
        ));
    }

    Ok(DecodedF32Audio {
        format: DecodedAudioFormat {
            sample_rate,
            channels,
            sample_format: DecodedSampleFormat::F32Interleaved,
        },
        samples,
        source: "FFmpeg decoded PCM",
    })
}

fn receive_resampled_frames(
    decoder: &mut ffmpeg::decoder::Audio,
    resampler: &mut ffmpeg::software::resampling::Context,
    channels: usize,
    remaining_samples_to_skip: &mut usize,
    output: &mut Vec<f32>,
) -> Result<()> {
    loop {
        let mut decoded = ffmpeg::frame::Audio::empty();
        match decoder.receive_frame(&mut decoded) {
            Ok(()) => {}
            Err(error) if is_receive_frame_drained(error) => break,
            Err(error) => {
                return Err(error).context("FFmpeg decoder failed while receiving frames.")
            }
        }

        let mut resampled = ffmpeg::frame::Audio::empty();
        resampler
            .run(&decoded, &mut resampled)
            .context("Failed to resample FFmpeg audio frame to f32.")?;
        append_packed_f32_frame(&resampled, channels, remaining_samples_to_skip, output)?;
    }

    Ok(())
}

fn is_receive_frame_drained(error: ffmpeg::Error) -> bool {
    match error {
        ffmpeg::Error::Eof => true,
        ffmpeg::Error::Other { errno } => errno == ffmpeg::error::EAGAIN,
        _ => false,
    }
}

fn flush_resampler(
    resampler: &mut ffmpeg::software::resampling::Context,
    channels: usize,
    remaining_samples_to_skip: &mut usize,
    output: &mut Vec<f32>,
) -> Result<()> {
    loop {
        let mut resampled = ffmpeg::frame::Audio::empty();
        let delay = resampler
            .flush(&mut resampled)
            .context("Failed to flush FFmpeg audio resampler.")?;
        append_packed_f32_frame(&resampled, channels, remaining_samples_to_skip, output)?;
        if delay.is_none() {
            break;
        }
    }

    Ok(())
}

fn append_packed_f32_frame(
    frame: &ffmpeg::frame::Audio,
    channels: usize,
    remaining_samples_to_skip: &mut usize,
    output: &mut Vec<f32>,
) -> Result<()> {
    if frame.samples() == 0 {
        return Ok(());
    }
    if channels == 0 || !frame.is_packed() {
        return Err(anyhow!("FFmpeg resampler did not produce packed audio."));
    }
    if frame.format() != ffmpeg::format::Sample::F32(ffmpeg::format::sample::Type::Packed) {
        return Err(anyhow!("FFmpeg resampler did not produce f32 audio."));
    }

    let sample_count = frame.samples().saturating_mul(channels);
    let byte_count = sample_count.saturating_mul(std::mem::size_of::<f32>());
    let data = frame.data(0);
    if data.len() < byte_count {
        return Err(anyhow!("FFmpeg resampled frame data is truncated."));
    }

    let sample_offset = (*remaining_samples_to_skip).min(sample_count);
    *remaining_samples_to_skip -= sample_offset;
    for chunk in data[sample_offset * std::mem::size_of::<f32>()..byte_count].chunks_exact(4) {
        output.push(f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }

    Ok(())
}

fn resolve_channel_layout(
    channel_layout: ffmpeg::ChannelLayout,
    channels: u16,
) -> ffmpeg::ChannelLayout {
    if channel_layout.is_empty() {
        ffmpeg::ChannelLayout::default(i32::from(channels))
    } else {
        channel_layout
    }
}

fn frame_index_for_seconds(seconds: f64, sample_rate: u32) -> usize {
    if !seconds.is_finite() || seconds <= 0.0 || sample_rate == 0 {
        return 0;
    }

    (seconds * f64::from(sample_rate))
        .floor()
        .clamp(0.0, usize::MAX as f64) as usize
}

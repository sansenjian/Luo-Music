use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const DEFAULT_MAX_DEPTH: usize = 10;
const DEFAULT_MAX_FILES: usize = 10_000;
const DEFAULT_EXTENSIONS: &[&str] = &[
    ".mp3", ".flac", ".m4a", ".ogg", ".wav", ".aac", ".ape", ".opus",
];

#[derive(Debug)]
struct ScanOptions {
    root: PathBuf,
    extensions: HashSet<String>,
    max_depth: usize,
    max_files: usize,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum ScannerMessage<'a> {
    #[serde(rename = "file")]
    File {
        path: &'a str,
        size: u64,
        #[serde(rename = "modifiedAt")]
        modified_at: u64,
    },
    #[serde(rename = "done")]
    Done { count: usize },
}

fn main() {
    if let Err(error) = run() {
        eprintln!("[local-library-scanner] {error:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let options = parse_args(env::args().skip(1))?;
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    let count = scan_folder(&options, &mut stdout)?;

    serde_json::to_writer(&mut stdout, &ScannerMessage::Done { count })?;
    writeln!(stdout)?;
    stdout.flush()?;

    Ok(())
}

fn parse_args(args: impl Iterator<Item = String>) -> Result<ScanOptions> {
    let mut root: Option<PathBuf> = None;
    let mut extensions = DEFAULT_EXTENSIONS
        .iter()
        .map(|extension| extension.to_string())
        .collect::<HashSet<_>>();
    let mut max_depth = DEFAULT_MAX_DEPTH;
    let mut max_files = DEFAULT_MAX_FILES;

    let mut args = args.peekable();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" => {
                root = Some(PathBuf::from(
                    args.next()
                        .ok_or_else(|| anyhow!("--root requires a value"))?,
                ));
            }
            "--extensions" => {
                let value = args
                    .next()
                    .ok_or_else(|| anyhow!("--extensions requires a value"))?;
                extensions = value
                    .split(',')
                    .map(normalize_extension)
                    .filter(|extension| !extension.is_empty())
                    .collect();
            }
            "--max-depth" => {
                max_depth = parse_usize_arg("--max-depth", args.next())?;
            }
            "--max-files" => {
                max_files = parse_usize_arg("--max-files", args.next())?;
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            value => return Err(anyhow!("unknown argument: {value}")),
        }
    }

    let root = root.ok_or_else(|| anyhow!("--root is required"))?;
    let root = if root.is_absolute() {
        root
    } else {
        env::current_dir()
            .context("failed to resolve current directory")?
            .join(root)
    };

    Ok(ScanOptions {
        root,
        extensions,
        max_depth,
        max_files,
    })
}

fn parse_usize_arg(name: &str, value: Option<String>) -> Result<usize> {
    let raw = value.ok_or_else(|| anyhow!("{name} requires a value"))?;
    raw.parse::<usize>()
        .with_context(|| format!("{name} must be a positive integer"))
}

fn print_help() {
    println!(
        "Usage: local-library-scanner --root <path> [--extensions .mp3,.flac] [--max-depth 10] [--max-files 10000]"
    );
}

fn normalize_extension(value: &str) -> String {
    let trimmed = value.trim().to_ascii_lowercase();
    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.starts_with('.') {
        trimmed
    } else {
        format!(".{trimmed}")
    }
}

fn scan_folder(options: &ScanOptions, stdout: &mut impl Write) -> Result<usize> {
    let mut stack = vec![(options.root.clone(), 0usize)];
    let mut count = 0usize;

    while let Some((directory, depth)) = stack.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                eprintln!(
                    "[local-library-scanner] failed to read directory {}: {error}",
                    directory.display()
                );
                continue;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    eprintln!("[local-library-scanner] failed to read entry: {error}");
                    continue;
                }
            };

            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    eprintln!(
                        "[local-library-scanner] failed to read file type {}: {error}",
                        entry.path().display()
                    );
                    continue;
                }
            };

            if file_type.is_symlink() {
                continue;
            }

            let entry_path = entry.path();
            if file_type.is_dir() {
                if depth < options.max_depth {
                    stack.push((entry_path, depth + 1));
                }
                continue;
            }

            if !file_type.is_file() || !is_audio_file(&entry_path, &options.extensions) {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(error) => {
                    eprintln!(
                        "[local-library-scanner] failed to stat file {}: {error}",
                        entry_path.display()
                    );
                    continue;
                }
            };
            let path = entry_path.to_string_lossy();
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
                .unwrap_or(0);

            serde_json::to_writer(
                &mut *stdout,
                &ScannerMessage::File {
                    path: path.as_ref(),
                    size: metadata.len(),
                    modified_at,
                },
            )?;
            writeln!(stdout)?;

            count += 1;
            if count >= options.max_files {
                return Ok(count);
            }
        }
    }

    Ok(count)
}

fn is_audio_file(path: &Path, extensions: &HashSet<String>) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(normalize_extension)
        .unwrap_or_default();

    extensions.contains(&extension)
}

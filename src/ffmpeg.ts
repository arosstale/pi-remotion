/**
 * ffmpeg wrapper — typed helpers for common video operations.
 * All functions return the command string + run it via the provided exec fn.
 */

import { resolve, basename, extname, dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export type ExecFn = (cmd: string, args: string[]) => Promise<ExecResult>;

// ── Probe ──────────────────────────────────────────────────────

export interface ProbeInfo {
	duration: number;       // seconds
	width: number;
	height: number;
	fps: number;
	codec: string;
	audioCodec: string;
	bitrate: number;        // kbps
	size: string;           // human-readable
	raw: string;
}

export async function probe(file: string, exec: ExecFn): Promise<ProbeInfo> {
	const r = await exec("ffprobe", [
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		resolve(file),
	]);
	if (r.exitCode !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
	const data = JSON.parse(r.stdout);
	const video = data.streams?.find((s: any) => s.codec_type === "video");
	const audio = data.streams?.find((s: any) => s.codec_type === "audio");
	const fmt = data.format || {};
	const fpsStr = video?.r_frame_rate || "30/1";
	const [num, den] = fpsStr.split("/").map(Number);
	return {
		duration: parseFloat(fmt.duration || "0"),
		width: video?.width || 0,
		height: video?.height || 0,
		fps: den ? num / den : num,
		codec: video?.codec_name || "unknown",
		audioCodec: audio?.codec_name || "none",
		bitrate: Math.round((parseInt(fmt.bit_rate || "0")) / 1000),
		size: fmt.size ? formatBytes(parseInt(fmt.size)) : "0B",
		raw: r.stdout,
	};
}

function formatBytes(b: number): string {
	if (b < 1024) return `${b}B`;
	if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
	if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)}MB`;
	return `${(b / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

// ── Transcode ──────────────────────────────────────────────────

export interface TranscodeOpts {
	input: string;
	output: string;
	codec?: string;      // h264 | h265 | vp9 | copy
	crf?: number;        // 0-51 (lower = better, default 23)
	preset?: string;     // ultrafast → veryslow
	scale?: string;      // "1280:720" or "1920:-1"
	fps?: number;
	audioBitrate?: string; // "128k"
	start?: string;      // "00:01:30"
	duration?: string;   // "00:00:10"
	noAudio?: boolean;
}

export async function transcode(opts: TranscodeOpts, exec: ExecFn): Promise<ExecResult> {
	const args: string[] = ["-y"];
	if (opts.start) args.push("-ss", opts.start);
	if (opts.duration) args.push("-t", opts.duration);
	args.push("-i", resolve(opts.input));
	if (opts.codec && opts.codec !== "copy") {
		args.push("-c:v", opts.codec === "h265" ? "libx265" : opts.codec === "vp9" ? "libvpx-vp9" : "libx264");
	} else if (opts.codec === "copy") {
		args.push("-c", "copy");
	}
	if (opts.crf !== undefined) args.push("-crf", String(opts.crf));
	if (opts.preset) args.push("-preset", opts.preset);
	if (opts.scale) args.push("-vf", `scale=${opts.scale}`);
	if (opts.fps) args.push("-r", String(opts.fps));
	if (opts.noAudio) args.push("-an");
	if (opts.audioBitrate) args.push("-b:a", opts.audioBitrate);
	args.push(resolve(opts.output));
	return exec("ffmpeg", args);
}

// ── Extract frames ─────────────────────────────────────────────

export interface ExtractFramesOpts {
	input: string;
	outDir: string;
	fps?: number;        // frames per second to extract (default: 1)
	start?: string;
	duration?: string;
	format?: string;     // png | jpg (default: png)
}

export async function extractFrames(opts: ExtractFramesOpts, exec: ExecFn): Promise<ExecResult> {
	const outDir = resolve(opts.outDir);
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	const ext = opts.format || "png";
	const args: string[] = ["-y"];
	if (opts.start) args.push("-ss", opts.start);
	if (opts.duration) args.push("-t", opts.duration);
	args.push("-i", resolve(opts.input));
	args.push("-vf", `fps=${opts.fps || 1}`);
	args.push(join(outDir, `frame_%04d.${ext}`));
	return exec("ffmpeg", args);
}

// ── GIF ────────────────────────────────────────────────────────

export interface GifOpts {
	input: string;
	output: string;
	fps?: number;        // default 10
	width?: number;      // default 480
	start?: string;
	duration?: string;
}

export async function toGif(opts: GifOpts, exec: ExecFn): Promise<ExecResult> {
	const w = opts.width || 480;
	const fps = opts.fps || 10;
	const args: string[] = ["-y"];
	if (opts.start) args.push("-ss", opts.start);
	if (opts.duration) args.push("-t", opts.duration);
	args.push("-i", resolve(opts.input));
	args.push("-vf", `fps=${fps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
	args.push("-loop", "0");
	args.push(resolve(opts.output));
	return exec("ffmpeg", args);
}

// ── Audio operations ───────────────────────────────────────────

export async function addAudio(
	video: string, audio: string, output: string, exec: ExecFn, opts?: { shortest?: boolean }
): Promise<ExecResult> {
	const args = ["-y", "-i", resolve(video), "-i", resolve(audio), "-c:v", "copy", "-c:a", "aac"];
	if (opts?.shortest) args.push("-shortest");
	args.push(resolve(output));
	return exec("ffmpeg", args);
}

export async function extractAudio(
	input: string, output: string, exec: ExecFn
): Promise<ExecResult> {
	return exec("ffmpeg", ["-y", "-i", resolve(input), "-vn", "-c:a", "copy", resolve(output)]);
}

// ── Concat ─────────────────────────────────────────────────────

export async function concat(
	files: string[], output: string, exec: ExecFn
): Promise<ExecResult> {
	// Use concat demuxer — write temp file list
	const listPath = resolve(dirname(output), ".ffmpeg-concat-list.txt");
	const content = files.map(f => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join("\n");
	const { writeFileSync, unlinkSync } = await import("node:fs");
	writeFileSync(listPath, content);
	try {
		const r = await exec("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", resolve(output)]);
		unlinkSync(listPath);
		return r;
	} catch (e) {
		unlinkSync(listPath);
		throw e;
	}
}

// ── Thumbnail ──────────────────────────────────────────────────

export async function thumbnail(
	input: string, output: string, exec: ExecFn, time?: string
): Promise<ExecResult> {
	return exec("ffmpeg", [
		"-y", "-ss", time || "00:00:01", "-i", resolve(input),
		"-frames:v", "1", "-q:v", "2", resolve(output),
	]);
}

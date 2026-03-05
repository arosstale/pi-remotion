import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import {
	probe,
	transcode,
	extractFrames,
	toGif,
	addAudio,
	extractAudio,
	concat,
	thumbnail,
	type ExecResult,
} from "../src/ffmpeg.js";

export default function (pi: ExtensionAPI) {
	// ── Helper: run a command via pi.exec ─────────────────────
	async function exec(cmd: string, args: string[]): Promise<ExecResult> {
		const result = await pi.exec(cmd, args);
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
		};
	}

	// ── /ffprobe — inspect any video/audio file ──────────────
	pi.addCommand({
		name: "ffprobe",
		description: "Inspect a video or audio file — duration, resolution, codec, bitrate",
		parameters: Type.Object({
			file: Type.String({ description: "Path to video/audio file" }),
		}),
		execute: async ({ file }) => {
			try {
				const info = await probe(file, exec);
				return Text(
					`📹 ${file}\n` +
					`   Duration:  ${info.duration.toFixed(1)}s\n` +
					`   Size:      ${info.size}\n` +
					`   Video:     ${info.width}×${info.height} @ ${info.fps.toFixed(1)}fps (${info.codec})\n` +
					`   Audio:     ${info.audioCodec}\n` +
					`   Bitrate:   ${info.bitrate} kbps`
				);
			} catch (e: any) {
				return Text(`❌ ${e.message}`);
			}
		},
	});

	// ── /transcode — convert between formats ─────────────────
	pi.addCommand({
		name: "transcode",
		description: "Convert video: change codec, resolution, framerate, trim, or compress",
		parameters: Type.Object({
			input: Type.String({ description: "Input video path" }),
			output: Type.String({ description: "Output video path" }),
			codec: Type.Optional(Type.String({ description: "h264 | h265 | vp9 | copy (default: h264)" })),
			crf: Type.Optional(Type.Number({ description: "Quality 0-51, lower=better (default: 23)" })),
			preset: Type.Optional(Type.String({ description: "Encoding speed: ultrafast → veryslow" })),
			scale: Type.Optional(Type.String({ description: "Resolution e.g. 1280:720 or 1920:-1" })),
			fps: Type.Optional(Type.Number({ description: "Target framerate" })),
			start: Type.Optional(Type.String({ description: "Start time e.g. 00:01:30" })),
			duration: Type.Optional(Type.String({ description: "Duration e.g. 00:00:10" })),
			noAudio: Type.Optional(Type.Boolean({ description: "Strip audio track" })),
		}),
		execute: async (opts) => {
			const r = await transcode(opts, exec);
			if (r.exitCode !== 0) return Text(`❌ ffmpeg failed:\n${r.stderr.slice(-500)}`);
			try {
				const info = await probe(opts.output, exec);
				return Text(`✅ ${opts.output}\n   ${info.width}×${info.height} ${info.codec} ${info.duration.toFixed(1)}s ${info.size}`);
			} catch {
				return Text(`✅ ${opts.output} (created)`);
			}
		},
	});

	// ── /frames — extract frames from video ──────────────────
	pi.addCommand({
		name: "frames",
		description: "Extract frames from a video as PNG/JPG images",
		parameters: Type.Object({
			input: Type.String({ description: "Input video path" }),
			outDir: Type.String({ description: "Output directory for frames" }),
			fps: Type.Optional(Type.Number({ description: "Frames per second to extract (default: 1)" })),
			start: Type.Optional(Type.String({ description: "Start time" })),
			duration: Type.Optional(Type.String({ description: "Duration to extract" })),
			format: Type.Optional(Type.String({ description: "png | jpg (default: png)" })),
		}),
		execute: async (opts) => {
			const r = await extractFrames(opts, exec);
			if (r.exitCode !== 0) return Text(`❌ ffmpeg failed:\n${r.stderr.slice(-500)}`);
			const ls = await exec("ls", ["-1", opts.outDir]);
			const count = ls.stdout.trim().split("\n").filter(Boolean).length;
			return Text(`✅ Extracted ${count} frames → ${opts.outDir}`);
		},
	});

	// ── /gif — convert video clip to animated GIF ────────────
	pi.addCommand({
		name: "gif",
		description: "Convert a video (or clip) to an optimized animated GIF",
		parameters: Type.Object({
			input: Type.String({ description: "Input video path" }),
			output: Type.String({ description: "Output GIF path" }),
			fps: Type.Optional(Type.Number({ description: "GIF framerate (default: 10)" })),
			width: Type.Optional(Type.Number({ description: "GIF width in pixels (default: 480)" })),
			start: Type.Optional(Type.String({ description: "Start time e.g. 00:00:05" })),
			duration: Type.Optional(Type.String({ description: "Duration e.g. 00:00:03" })),
		}),
		execute: async (opts) => {
			const r = await toGif(opts, exec);
			if (r.exitCode !== 0) return Text(`❌ ffmpeg failed:\n${r.stderr.slice(-500)}`);
			return Text(`✅ ${opts.output}`);
		},
	});

	// ── /addaudio — mux audio onto a video ───────────────────
	pi.addCommand({
		name: "addaudio",
		description: "Add an audio track to a video (or replace existing audio)",
		parameters: Type.Object({
			video: Type.String({ description: "Input video path" }),
			audio: Type.String({ description: "Audio file to add" }),
			output: Type.String({ description: "Output video path" }),
			shortest: Type.Optional(Type.Boolean({ description: "Trim to shorter of video/audio (default: false)" })),
		}),
		execute: async (opts) => {
			const r = await addAudio(opts.video, opts.audio, opts.output, exec, { shortest: opts.shortest });
			if (r.exitCode !== 0) return Text(`❌ ffmpeg failed:\n${r.stderr.slice(-500)}`);
			return Text(`✅ ${opts.output}`);
		},
	});

	// ── /extractaudio — rip audio from video ─────────────────
	pi.addCommand({
		name: "extractaudio",
		description: "Extract the audio track from a video file",
		parameters: Type.Object({
			input: Type.String({ description: "Input video path" }),
			output: Type.String({ description: "Output audio path (e.g. track.aac, track.mp3)" }),
		}),
		execute: async (opts) => {
			const r = await extractAudio(opts.input, opts.output, exec);
			if (r.exitCode !== 0) return Text(`❌ ffmpeg failed:\n${r.stderr.slice(-500)}`);
			return Text(`✅ ${opts.output}`);
		},
	});

	// ── /concat — join multiple videos ───────────────────────
	pi.addCommand({
		name: "concat",
		description: "Concatenate multiple video files into one (same codec required)",
		parameters: Type.Object({
			files: Type.Array(Type.String(), { description: "Video file paths in order" }),
			output: Type.String({ description: "Output video path" }),
		}),
		execute: async (opts) => {
			const r = await concat(opts.files, opts.output, exec);
			if (r.exitCode !== 0) return Text(`❌ ffmpeg failed:\n${r.stderr.slice(-500)}`);
			return Text(`✅ ${opts.output} (${opts.files.length} files joined)`);
		},
	});

	// ── /thumbnail — grab a single frame as image ────────────
	pi.addCommand({
		name: "thumbnail",
		description: "Extract a single frame as a thumbnail image",
		parameters: Type.Object({
			input: Type.String({ description: "Input video path" }),
			output: Type.String({ description: "Output image path (e.g. thumb.jpg)" }),
			time: Type.Optional(Type.String({ description: "Timestamp e.g. 00:00:05 (default: 00:00:01)" })),
		}),
		execute: async (opts) => {
			const r = await thumbnail(opts.input, opts.output, exec, opts.time);
			if (r.exitCode !== 0) return Text(`❌ ffmpeg failed:\n${r.stderr.slice(-500)}`);
			return Text(`✅ ${opts.output}`);
		},
	});

	// ── /render — trigger Remotion render ────────────────────
	pi.addCommand({
		name: "render",
		description: "Render a Remotion project to MP4. Runs `node render.mjs` in the given directory.",
		parameters: Type.Object({
			project: Type.String({ description: "Path to Remotion project dir (must contain render.mjs)" }),
			out: Type.Optional(Type.String({ description: "Output file path" })),
			fps: Type.Optional(Type.Number({ description: "Framerate (default: 30)" })),
		}),
		execute: async (opts) => {
			const args = ["render.mjs"];
			if (opts.out) args.push("--out", opts.out);
			if (opts.fps) args.push("--fps", String(opts.fps));
			const r = await pi.exec("node", args, { cwd: opts.project });
			if (r.exitCode !== 0) return Text(`❌ Render failed:\n${r.stderr.slice(-800)}`);
			// Extract output path from stdout
			const match = r.stdout.match(/✅\s*(.+)/);
			return Text(match ? `✅ ${match[1].trim()}` : `✅ Render complete`);
		},
	});

	// ── LLM Tools ────────────────────────────────────────────
	// These let the LLM call ffmpeg/remotion operations directly

	pi.addLLMTool({
		name: "video_probe",
		description: "Get video/audio file info: duration, resolution, codec, bitrate, size",
		parameters: Type.Object({
			file: Type.String({ description: "Path to video or audio file" }),
		}),
		execute: async ({ file }) => {
			const info = await probe(file, exec);
			return JSON.stringify(info, null, 2);
		},
	});

	pi.addLLMTool({
		name: "video_transcode",
		description: "Transcode video: change codec/resolution/fps, trim, compress. Returns output path on success.",
		parameters: Type.Object({
			input: Type.String({ description: "Input video path" }),
			output: Type.String({ description: "Output video path" }),
			codec: Type.Optional(Type.String({ description: "h264 | h265 | vp9 | copy" })),
			crf: Type.Optional(Type.Number({ description: "Quality 0-51" })),
			scale: Type.Optional(Type.String({ description: "Resolution e.g. 1280:720" })),
			fps: Type.Optional(Type.Number({ description: "Target framerate" })),
			start: Type.Optional(Type.String({ description: "Start time" })),
			duration: Type.Optional(Type.String({ description: "Duration" })),
			noAudio: Type.Optional(Type.Boolean({ description: "Strip audio" })),
		}),
		execute: async (opts) => {
			const r = await transcode(opts, exec);
			if (r.exitCode !== 0) return `Error: ${r.stderr.slice(-300)}`;
			return `OK: ${opts.output}`;
		},
	});

	pi.addLLMTool({
		name: "video_to_gif",
		description: "Convert video clip to optimized GIF with palette generation",
		parameters: Type.Object({
			input: Type.String({ description: "Input video" }),
			output: Type.String({ description: "Output GIF" }),
			fps: Type.Optional(Type.Number({ description: "GIF fps (default 10)" })),
			width: Type.Optional(Type.Number({ description: "Width px (default 480)" })),
			start: Type.Optional(Type.String({ description: "Start time" })),
			duration: Type.Optional(Type.String({ description: "Duration" })),
		}),
		execute: async (opts) => {
			const r = await toGif(opts, exec);
			if (r.exitCode !== 0) return `Error: ${r.stderr.slice(-300)}`;
			return `OK: ${opts.output}`;
		},
	});

	pi.addLLMTool({
		name: "video_add_audio",
		description: "Mux an audio track onto a video file",
		parameters: Type.Object({
			video: Type.String({ description: "Video file" }),
			audio: Type.String({ description: "Audio file" }),
			output: Type.String({ description: "Output file" }),
			shortest: Type.Optional(Type.Boolean({ description: "Trim to shorter stream" })),
		}),
		execute: async (opts) => {
			const r = await addAudio(opts.video, opts.audio, opts.output, exec, { shortest: opts.shortest });
			if (r.exitCode !== 0) return `Error: ${r.stderr.slice(-300)}`;
			return `OK: ${opts.output}`;
		},
	});

	pi.addLLMTool({
		name: "video_concat",
		description: "Join multiple video files into one (same codec)",
		parameters: Type.Object({
			files: Type.Array(Type.String(), { description: "Video paths in order" }),
			output: Type.String({ description: "Output path" }),
		}),
		execute: async (opts) => {
			const r = await concat(opts.files, opts.output, exec);
			if (r.exitCode !== 0) return `Error: ${r.stderr.slice(-300)}`;
			return `OK: ${opts.output}`;
		},
	});

	pi.addLLMTool({
		name: "remotion_render",
		description: "Render a Remotion project to video. Runs node render.mjs in the project dir.",
		parameters: Type.Object({
			project: Type.String({ description: "Remotion project directory (contains render.mjs)" }),
			out: Type.Optional(Type.String({ description: "Output file path" })),
			fps: Type.Optional(Type.Number({ description: "Framerate" })),
		}),
		execute: async (opts) => {
			const args = ["render.mjs"];
			if (opts.out) args.push("--out", opts.out);
			if (opts.fps) args.push("--fps", String(opts.fps));
			const r = await pi.exec("node", args, { cwd: opts.project });
			if (r.exitCode !== 0) return `Error: ${r.stderr.slice(-300)}`;
			const match = r.stdout.match(/✅\s*(.+)/);
			return match ? `OK: ${match[1].trim()}` : "OK: render complete";
		},
	});
}

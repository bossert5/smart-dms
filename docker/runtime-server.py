#!/usr/bin/env python3
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


STORAGE_ROOT = os.environ.get("SMART_DMS_STORAGE_ROOT", "/data")
ROLE = os.environ.get("SMART_DMS_RUNTIME_ROLE", "ocr")
PORT = int(os.environ.get("SMART_DMS_RUNTIME_PORT", "8080"))
HELPER_SCRIPT = os.environ.get(
    "SMART_DMS_OCR_HELPER_SCRIPT", "/usr/local/bin/smart-dms-ocr-helper"
)

OCR_HELPER_COMMANDS = {
    "count-pdf-pages",
    "detect-language",
    "extract-pdf-text",
    "remove-blank-pdf-pages",
    "render-pdf-page",
    "rotate-pdf-pages",
}
DOCLING_HELPER_COMMANDS = {"extract-docling-markdown"}


class RuntimeHandler(BaseHTTPRequestHandler):
    server_version = "SmartDMSRuntime/1.0"

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"error": "not-found"})
            return

        self.send_json(200, {"status": "ok", "role": ROLE})

    def do_POST(self):
        if self.path != "/run":
            self.send_json(404, {"error": "not-found"})
            return

        try:
            payload = self.read_json()
            command = payload.get("command")
            args = payload.get("args")
            timeout_ms = payload.get("timeoutMs")
            argv = command_argv(command, args)
            timeout = timeout_ms / 1000 if isinstance(timeout_ms, (int, float)) else None
            result = subprocess.run(
                argv,
                cwd=STORAGE_ROOT,
                timeout=timeout,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            self.send_json(
                200,
                {
                    "exitCode": result.returncode,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                },
            )
        except subprocess.TimeoutExpired as error:
            self.send_json(
                200,
                {
                    "exitCode": 124,
                    "stdout": process_output_text(error.stdout),
                    "stderr": f"Command timed out after {timeout_ms} ms.",
                },
            )
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:
            self.send_json(500, {"error": type(error).__name__})

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("Missing JSON body.")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def command_argv(command, args):
    if not isinstance(command, str) or not isinstance(args, list):
        raise ValueError("Command and args are required.")
    if not all(isinstance(arg, str) for arg in args):
        raise ValueError("All args must be strings.")

    if ROLE == "ocr":
        return ocr_command_argv(command, args)
    if ROLE == "docling":
        return docling_command_argv(command, args)

    raise ValueError("Unknown runtime role.")


def ocr_command_argv(command, args):
    if command == "ocrmypdf":
        return ["ocrmypdf", *args]
    if command == "gs":
        return ["gs", *args]
    if command == "python3":
        helper_command = validate_helper_args(args, OCR_HELPER_COMMANDS)
        return [python_executable(), HELPER_SCRIPT, helper_command, *args[2:]]

    raise ValueError("Command is not allowed for OCR runtime.")


def docling_command_argv(command, args):
    if command == "python3":
        helper_command = validate_helper_args(args, DOCLING_HELPER_COMMANDS)
        return [python_executable(), HELPER_SCRIPT, helper_command, *args[2:]]

    raise ValueError("Command is not allowed for Docling runtime.")


def validate_helper_args(args, allowed_commands):
    if len(args) < 2:
        raise ValueError("Helper command is missing.")
    if args[0] != HELPER_SCRIPT:
        raise ValueError("Only the Smart DMS helper script is allowed.")
    helper_command = args[1]
    if helper_command not in allowed_commands:
        raise ValueError("Helper command is not allowed for this runtime.")
    return helper_command


def python_executable():
    return os.environ.get("SMART_DMS_PYTHON", "python3")


def process_output_text(output):
    if output is None:
        return ""
    if isinstance(output, bytes):
        return output.decode("utf-8", errors="replace")
    return str(output)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), RuntimeHandler).serve_forever()

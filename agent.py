#!/usr/bin/env python3
"""
PartyTime Dev Agent
-------------------
Self-pacing dev agent with prompt caching, spend tracking, and Telegram check-ins.
Manages its own budget — you set MONTHLY_BUDGET in .env and forget it.

Usage:
    python agent.py "fix the silent errors in loadLikedSongs"  # one-shot via CLI
    python agent.py                                             # listen mode via Telegram
"""

import os
import sys
import time
import json
import subprocess
import urllib.request
import urllib.parse
import anthropic
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT  = os.environ["TELEGRAM_CHAT_ID"]
REPO_ROOT      = Path(os.environ["REPO_ROOT"])
MONTHLY_BUDGET = float(os.environ.get("MONTHLY_BUDGET", "20"))
USAGE_FILE     = Path(__file__).parent / "agent_usage.json"
TELEGRAM_API   = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

# Model pricing per million tokens
MODELS = {
    "sonnet": {
        "id": "claude-sonnet-4-6",
        "input_cost":  3.00 / 1_000_000,
        "output_cost": 15.00 / 1_000_000,
        "cache_write": 3.75 / 1_000_000,
        "cache_read":  0.30 / 1_000_000,
    },
    "haiku": {
        "id": "claude-haiku-4-5-20251001",
        "input_cost":  0.80 / 1_000_000,
        "output_cost": 4.00 / 1_000_000,
        "cache_write": 1.00 / 1_000_000,
        "cache_read":  0.08 / 1_000_000,
    },
}

claude = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# ── Usage tracking ─────────────────────────────────────────────────────────────
def load_usage() -> dict:
    now = datetime.now(timezone.utc)
    if USAGE_FILE.exists():
        data = json.loads(USAGE_FILE.read_text())
        saved = datetime.fromisoformat(data["month"])
        if saved.month != now.month or saved.year != now.year:
            data = {"month": now.isoformat(), "spent": 0.0, "tasks": 0}
            USAGE_FILE.write_text(json.dumps(data, indent=2))
    else:
        data = {"month": now.isoformat(), "spent": 0.0, "tasks": 0}
        USAGE_FILE.write_text(json.dumps(data, indent=2))
    return data

def save_usage(data: dict):
    USAGE_FILE.write_text(json.dumps(data, indent=2))

def record_cost(cost: float):
    data = load_usage()
    data["spent"] = round(data["spent"] + cost, 6)
    data["tasks"] += 1
    save_usage(data)

def current_spend() -> float:
    return load_usage()["spent"]

def pace_status() -> dict:
    now = datetime.now(timezone.utc)
    days_in_month = 30
    day_fraction = min((now.day - 1) / days_in_month, 1.0)
    spend = current_spend()
    spend_fraction = spend / MONTHLY_BUDGET if MONTHLY_BUDGET > 0 else 0
    return {
        "spend": spend,
        "budget": MONTHLY_BUDGET,
        "spend_fraction": spend_fraction,
        "day_fraction": day_fraction,
        "ahead_by": spend_fraction - day_fraction,
        "remaining": MONTHLY_BUDGET - spend,
    }

def choose_model(pace: dict) -> dict:
    if pace["ahead_by"] > 0.15 or pace["remaining"] < (MONTHLY_BUDGET * 0.30):
        return MODELS["haiku"]
    return MODELS["sonnet"]

def calculate_cost(usage, model: dict) -> float:
    cost = 0.0
    if hasattr(usage, "input_tokens"):
        cost += usage.input_tokens * model["input_cost"]
    if hasattr(usage, "output_tokens"):
        cost += usage.output_tokens * model["output_cost"]
    if hasattr(usage, "cache_creation_input_tokens"):
        cost += (usage.cache_creation_input_tokens or 0) * model["cache_write"]
    if hasattr(usage, "cache_read_input_tokens"):
        cost += (usage.cache_read_input_tokens or 0) * model["cache_read"]
    return cost

# ── Telegram helpers ───────────────────────────────────────────────────────────
def _tg_request(method: str, params: dict = None) -> dict:
    url = f"{TELEGRAM_API}/{method}"
    if params:
        data = urllib.parse.urlencode(params).encode()
        req = urllib.request.Request(url, data=data)
    else:
        req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def send_text(msg: str):
    _tg_request("sendMessage", {"chat_id": TELEGRAM_CHAT, "text": f"🤖 PartyTime Agent\n\n{msg}"})
    print(f"\n📱 Sent: {msg}\n")

def _get_latest_update_id() -> int | None:
    data = _tg_request("getUpdates", {"offset": -1, "limit": 1})
    if data.get("result"):
        return data["result"][-1]["update_id"]
    return None

def wait_for_reply(timeout_minutes: int = 30) -> str:
    """Wait for Jay to reply to a check-in. Returns his reply or 'timeout'."""
    print(f"⏳ Waiting for reply (up to {timeout_minutes} min)...")
    deadline = time.time() + (timeout_minutes * 60)
    last_id = _get_latest_update_id()
    offset = (last_id + 1) if last_id else 0
    while time.time() < deadline:
        time.sleep(5)
        data = _tg_request("getUpdates", {"offset": offset, "limit": 1, "timeout": 10})
        results = data.get("result", [])
        for update in results:
            offset = update["update_id"] + 1
            msg = update.get("message", {})
            if str(msg.get("chat", {}).get("id")) == str(TELEGRAM_CHAT) and msg.get("text"):
                body = msg["text"].strip()
                print(f"📨 Got reply: {body}")
                return body.strip().lower()
    return "timeout"

def listen_for_task() -> str:
    """Block indefinitely until Jay sends a new task via Telegram."""
    print("👂 Listening for task via Telegram...")
    last_id = _get_latest_update_id()
    offset = (last_id + 1) if last_id else 0
    while True:
        time.sleep(3)
        data = _tg_request("getUpdates", {"offset": offset, "limit": 1, "timeout": 10})
        for update in data.get("result", []):
            offset = update["update_id"] + 1
            msg = update.get("message", {})
            if str(msg.get("chat", {}).get("id")) == str(TELEGRAM_CHAT):
                text = msg.get("text", "").strip()
                if text and not text.startswith("/"):
                    return text

# ── File / git tools ───────────────────────────────────────────────────────────
def read_file(path: str) -> str:
    full = REPO_ROOT / path
    if not full.exists():
        return f"[File not found: {path}]"
    return full.read_text(encoding="utf-8", errors="replace")

def write_file(path: str, content: str) -> str:
    full = REPO_ROOT / path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    return f"[Written: {path}]"

def run_command(cmd: str) -> str:
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=REPO_ROOT,
            capture_output=True, text=True, timeout=60
        )
        output = (result.stdout + result.stderr).strip()
        return output[:3000] if output else "[No output]"
    except subprocess.TimeoutExpired:
        return "[Command timed out after 60s]"
    except Exception as e:
        return f"[Command error: {e}]"

def list_files(directory: str = ".") -> str:
    full = REPO_ROOT / directory
    if not full.exists():
        return f"[Directory not found: {directory}]"
    files = []
    for f in sorted(full.rglob("*")):
        if f.is_file() and ".git" not in f.parts and "node_modules" not in f.parts:
            files.append(str(f.relative_to(REPO_ROOT)))
    return "\n".join(files[:200])

def git_diff() -> str:
    return run_command("git diff --stat HEAD")

def git_commit(message: str) -> str:
    run_command("git add -A")
    return run_command(f'git commit -m "{message}"')

def git_new_branch(name: str) -> str:
    return run_command(f"git checkout -b {name}")

# ── Tool definitions ───────────────────────────────────────────────────────────
TOOLS = [
    {
        "name": "read_file",
        "description": "Read a file from the PartyTime repo. Path is relative to repo root.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Write content to a file in the repo. Creates if it doesn't exist.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "run_command",
        "description": "Run a shell command in the repo root. Returns stdout+stderr.",
        "input_schema": {
            "type": "object",
            "properties": {"cmd": {"type": "string"}},
            "required": ["cmd"]
        }
    },
    {
        "name": "list_files",
        "description": "List all files in a directory (recursive). Defaults to repo root.",
        "input_schema": {
            "type": "object",
            "properties": {"directory": {"type": "string"}},
            "required": []
        }
    },
    {
        "name": "git_diff",
        "description": "Show summary of uncommitted changes (git diff --stat HEAD).",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "send_checkin",
        "description": "Text Jay and wait for his reply. Use before making changes and after finishing. Returns Jay's reply.",
        "input_schema": {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"]
        }
    },
    {
        "name": "git_commit",
        "description": "Stage all changes and commit. ONLY after Jay explicitly approves via send_checkin.",
        "input_schema": {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"]
        }
    },
    {
        "name": "git_new_branch",
        "description": "Create and checkout a new git branch.",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"]
        }
    }
]

# ── Tool executor ──────────────────────────────────────────────────────────────
def execute_tool(name: str, inputs: dict) -> str:
    if name == "read_file":       return read_file(inputs["path"])
    if name == "write_file":      return write_file(inputs["path"], inputs["content"])
    if name == "run_command":     return run_command(inputs["cmd"])
    if name == "list_files":      return list_files(inputs.get("directory", "."))
    if name == "git_diff":        return git_diff()
    if name == "git_commit":      return git_commit(inputs["message"])
    if name == "git_new_branch":  return git_new_branch(inputs["name"])
    if name == "send_checkin":
        send_text(inputs["message"])
        reply = wait_for_reply()
        if reply == "timeout":
            return "__CHECKIN_TIMEOUT__"
        return f"Jay replied: '{reply}'"
    return f"[Unknown tool: {name}]"

# ── Main agent loop ────────────────────────────────────────────────────────────
def run_agent(task: str):
    pace = pace_status()

    if pace["spend_fraction"] >= 0.80:
        msg = (f"At {pace['spend_fraction']*100:.0f}% of the ${MONTHLY_BUDGET} monthly budget. "
               f"Holding off on new tasks until next month or you raise the limit in .env.")
        print(f"🛑 {msg}")
        send_text(msg)
        return

    model = choose_model(pace)
    model_note = " (running lean this cycle — using Haiku)" if model == MODELS["haiku"] else ""
    print(f"\n🤖 PartyTime Dev Agent\nTask: {task}\nModel: {model['id']}{model_note}")
    print(f"💰 Spend: ${pace['spend']:.4f} / ${pace['budget']} "
          f"({pace['spend_fraction']*100:.1f}% used, {pace['day_fraction']*100:.0f}% through month)\n{'─'*50}")

    system_prompt_text = (Path(__file__).parent / "agent_system_prompt.txt").read_text()
    context_text = read_file("AGENT_CONTEXT.md")

    if model == MODELS["haiku"]:
        pace_note = (f"\n\nNOTE: You're running on Haiku this session to stay on budget "
                     f"(${pace['spend']:.2f} spent of ${pace['budget']} this month). "
                     f"Keep your work tight and efficient.")
    elif pace["ahead_by"] > 0.05:
        pace_note = (f"\n\nNOTE: You're running slightly ahead of pace this month "
                     f"(${pace['spend']:.2f} of ${pace['budget']} used). "
                     f"Be efficient — read only what you need, no exploratory file reads.")
    else:
        pace_note = ""

    initial_message = (
        f"Here is the current AGENT_CONTEXT.md:\n\n"
        f"<context>\n{context_text}\n</context>\n\n"
        f"Task from Jay: {task}"
        f"{pace_note}\n\n"
        f"Start by reading any files you need, then check in with Jay before making changes."
    )

    system = [
        {
            "type": "text",
            "text": system_prompt_text,
            "cache_control": {"type": "ephemeral"}
        }
    ]

    messages = [{"role": "user", "content": initial_message}]
    total_cost = 0.0

    while True:
        response = claude.messages.create(
            model=model["id"],
            max_tokens=4096,
            system=system,
            tools=TOOLS,
            messages=messages
        )

        call_cost = calculate_cost(response.usage, model)
        total_cost += call_cost
        record_cost(call_cost)
        print(f"🧠 stop={response.stop_reason} | call=${call_cost:.4f} | session=${total_cost:.4f} | month=${current_spend():.4f}")

        assistant_content = response.content
        messages.append({"role": "assistant", "content": assistant_content})

        if response.stop_reason == "end_turn":
            for block in response.content:
                if hasattr(block, "text") and block.text:
                    print(f"\n✅ Done:\n{block.text}")
            break

        if response.stop_reason == "tool_use":
            tool_blocks = [b for b in response.content if b.type == "tool_use"]
            checkins = [b for b in tool_blocks if b.name == "send_checkin"]
            others = [b for b in tool_blocks if b.name != "send_checkin"]

            tool_results = []
            timed_out = False
            for block in others + checkins:
                print(f"🔧 {block.name}({list(block.input.keys())})")
                result = execute_tool(block.name, block.input)

                if result == "__CHECKIN_TIMEOUT__":
                    timed_out = True
                    result = "Jay didn't reply within 30 minutes. Save your work and stop — he'll re-run you later."

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result
                })
            messages.append({"role": "user", "content": tool_results})

            if timed_out:
                response = claude.messages.create(
                    model=model["id"],
                    max_tokens=1024,
                    system=system,
                    tools=TOOLS,
                    messages=messages
                )
                call_cost = calculate_cost(response.usage, model)
                total_cost += call_cost
                record_cost(call_cost)
                for block in response.content:
                    if hasattr(block, "text") and block.text:
                        print(f"\n⏸️ {block.text}")
                send_text("Paused — didn't hear back. Text me a task when you're ready.")
                break
        else:
            print(f"⚠️  Unexpected stop_reason: {response.stop_reason}")
            break

    print(f"\n💰 Task cost: ${total_cost:.4f} | Monthly total: ${current_spend():.4f} / ${MONTHLY_BUDGET}")

# ── Entry ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) > 1:
        # One-shot mode: task passed via CLI
        task = " ".join(sys.argv[1:])
        run_agent(task)
    else:
        # Listen mode: wait for tasks from Jay via Telegram
        print("🎧 Telegram listen mode — waiting for tasks from Jay")
        send_text("Ready. What do you want me to work on?")
        while True:
            task = listen_for_task()
            print(f"\n📨 Task from Telegram: {task}")
            run_agent(task)

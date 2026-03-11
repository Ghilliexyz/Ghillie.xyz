#!/usr/bin/env python3
"""
Portfolio Data Updater for Ghillie.xyz

Uses yt-dlp to refresh YouTube view counts, titles, and links
in assets/js/portfolio-data.js, and detects new thumbnail images.

Usage:
    python tools/update_portfolio.py                       # Interactive menus
    python tools/update_portfolio.py --views-only           # Skip menus, views only
    python tools/update_portfolio.py --full --threads 8     # Skip menus, full update, 8 threads
    python tools/update_portfolio.py --newest --threads 8   # Skip menus, newest + auto-fetch
"""

import os
import re
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# ── Check yt-dlp is installed ──────────────────────────────────────────────

try:
    import yt_dlp
except ImportError:
    print("ERROR: yt-dlp is not installed.")
    print("Install it with:  pip install yt-dlp")
    sys.exit(1)

# ── Paths ──────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_FILE = PROJECT_ROOT / "assets" / "js" / "portfolio-data.js"
PORTFOLIO_IMG_DIR = PROJECT_ROOT / "assets" / "img" / "portfolio"

# ── ANSI helpers ──────────────────────────────────────────────────────────

# Enable ANSI escape codes on Windows 10+
if sys.platform == "win32":
    os.system("")  # Triggers VT100 mode in cmd.exe / Windows Terminal

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
WHITE = "\033[97m"
HIDE_CURSOR = "\033[?25l"
SHOW_CURSOR = "\033[?25h"


def move_up(n):
    if n > 0:
        sys.stdout.write(f"\033[{n}A")


def clear_line():
    sys.stdout.write("\033[2K\r")


# ── Thread-safe printing ─────────────────────────────────────────────────

_print_lock = threading.Lock()


def tprint(*args, **kwargs):
    """Thread-safe print."""
    with _print_lock:
        print(*args, **kwargs)


# ── Interactive menus ────────────────────────────────────────────────────


def get_key():
    """Read a single keypress. Returns 'up', 'down', 'space', 'enter', or char."""
    if sys.platform == "win32":
        import msvcrt
        key = msvcrt.getch()
        if key in (b"\xe0", b"\x00"):
            key2 = msvcrt.getch()
            if key2 == b"H":
                return "up"
            if key2 == b"P":
                return "down"
            return None
        if key == b"\r":
            return "enter"
        if key == b" ":
            return "space"
        if key == b"\x03":  # Ctrl+C
            raise KeyboardInterrupt
        return key.decode("utf-8", errors="ignore")
    else:
        import tty
        import termios
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            ch = sys.stdin.read(1)
            if ch == "\x1b":
                ch2 = sys.stdin.read(1)
                if ch2 == "[":
                    ch3 = sys.stdin.read(1)
                    if ch3 == "A":
                        return "up"
                    if ch3 == "B":
                        return "down"
                return None
            if ch in ("\r", "\n"):
                return "enter"
            if ch == " ":
                return "space"
            if ch == "\x03":
                raise KeyboardInterrupt
            return ch
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)


# ── Single-select arrow menu ─────────────────────────────────────────────


def arrow_menu(options, default=0):
    """Generic arrow-key menu. options = list of (label, description).
    Returns the selected index."""
    selected = default

    sys.stdout.write("\n")
    _draw_menu(options, selected)
    menu_lines = len(options) + 1

    try:
        sys.stdout.write(HIDE_CURSOR)
        while True:
            key = get_key()
            if key == "up":
                selected = (selected - 1) % len(options)
            elif key == "down":
                selected = (selected + 1) % len(options)
            elif key == "enter":
                break
            else:
                continue
            move_up(menu_lines)
            _draw_menu(options, selected)
    except KeyboardInterrupt:
        sys.stdout.write(SHOW_CURSOR + "\n")
        sys.exit(0)
    finally:
        sys.stdout.write(SHOW_CURSOR)

    # Final state
    move_up(menu_lines)
    for i, (label, desc) in enumerate(options):
        clear_line()
        if i == selected:
            sys.stdout.write(f"  {GREEN}{BOLD} > {label:<28s}{RESET} {WHITE}{desc}{RESET}\n")
        else:
            sys.stdout.write(f"  {DIM}   {label:<28s} {desc}{RESET}\n")
    clear_line()
    sys.stdout.write(f"\n  {GREEN}Selected: {options[selected][0]}{RESET}\n")
    sys.stdout.flush()
    return selected


def _draw_menu(options, selected):
    for i, (label, desc) in enumerate(options):
        clear_line()
        if i == selected:
            sys.stdout.write(f"  {CYAN}{BOLD} > {label:<28s}{RESET} {WHITE}{desc}{RESET}\n")
        else:
            sys.stdout.write(f"  {DIM}   {label:<28s} {desc}{RESET}\n")
    clear_line()
    sys.stdout.write(f"\n  {DIM}Use {RESET}arrow keys{DIM} to navigate, {RESET}Enter{DIM} to select{RESET}")
    sys.stdout.flush()


# ── Multi-select arrow menu ──────────────────────────────────────────────


def multi_select_menu(options, default_on=None):
    """Multi-select with arrow keys + space to toggle. options = list of (label, desc).
    default_on = set of indices on by default (all if None).
    Returns set of selected indices."""
    if default_on is None:
        toggled = set(range(len(options)))
    else:
        toggled = set(default_on)

    cursor = 0

    sys.stdout.write("\n")
    _draw_multi_menu(options, cursor, toggled)
    menu_lines = len(options) + 1

    try:
        sys.stdout.write(HIDE_CURSOR)
        while True:
            key = get_key()
            if key == "up":
                cursor = (cursor - 1) % len(options)
            elif key == "down":
                cursor = (cursor + 1) % len(options)
            elif key == "space":
                toggled.symmetric_difference_update({cursor})
            elif key == "enter":
                break
            else:
                continue
            move_up(menu_lines)
            _draw_multi_menu(options, cursor, toggled)
    except KeyboardInterrupt:
        sys.stdout.write(SHOW_CURSOR + "\n")
        sys.exit(0)
    finally:
        sys.stdout.write(SHOW_CURSOR)

    # Final state
    move_up(menu_lines)
    for i, (label, desc) in enumerate(options):
        clear_line()
        if i in toggled:
            sys.stdout.write(f"  {GREEN}  [{BOLD}x{RESET}{GREEN}] {label:<26s}{RESET} {WHITE}{desc}{RESET}\n")
        else:
            sys.stdout.write(f"  {DIM}  [ ] {label:<26s} {desc}{RESET}\n")
    clear_line()
    count = len(toggled)
    sys.stdout.write(f"\n  {GREEN}Selected: {count} channel{'s' if count != 1 else ''}{RESET}\n")
    sys.stdout.flush()
    return toggled


def _draw_multi_menu(options, cursor, toggled):
    for i, (label, desc) in enumerate(options):
        clear_line()
        arrow = " >" if i == cursor else "  "
        if i in toggled:
            check = f"{CYAN}x{RESET}" if i != cursor else f"{WHITE}{BOLD}x{RESET}"
            if i == cursor:
                sys.stdout.write(f"  {CYAN}{BOLD}{arrow}{RESET} [{check}] {CYAN}{BOLD}{label:<26s}{RESET} {WHITE}{desc}{RESET}\n")
            else:
                sys.stdout.write(f"  {DIM}{arrow}{RESET} [{check}] {label:<26s} {desc}\n")
        else:
            if i == cursor:
                sys.stdout.write(f"  {CYAN}{BOLD}{arrow}{RESET} [ ] {CYAN}{BOLD}{label:<26s}{RESET} {WHITE}{desc}{RESET}\n")
            else:
                sys.stdout.write(f"  {DIM}{arrow} [ ] {label:<26s} {desc}{RESET}\n")
    clear_line()
    sys.stdout.write(f"\n  {DIM}Use {RESET}arrow keys{DIM} to navigate, {RESET}Space{DIM} to toggle, {RESET}Enter{DIM} to confirm{RESET}")
    sys.stdout.flush()


# ── Menu wrappers ────────────────────────────────────────────────────────


def select_mode():
    """Show the mode selection menu. Returns mode string."""
    options = [
        ("Views Only",            "Update view counts, titles & links"),
        ("Full Update",           "+ Scan for new thumbnail images on disk"),
        ("Full + Newest Videos",  "+ Auto-fetch new uploads from YouTube"),
    ]
    mode_map = ["views_only", "full", "newest"]
    return mode_map[arrow_menu(options, default=1)]


def select_threads():
    """Show the thread count selection menu. Returns thread count int."""
    options = [
        ("1  (sequential)",  "Safe and slow, one request at a time"),
        ("2  threads",       "Light parallelism"),
        ("4  threads",       "Recommended for most connections"),
        ("8  threads",       "Fast, moderate load on YouTube"),
        ("16 threads",       "Fastest, may trigger rate limits"),
    ]
    thread_counts = [1, 2, 4, 8, 16]
    return thread_counts[arrow_menu(options, default=2)]


def select_channels(creators):
    """Show multi-select for which creators to check for new uploads.
    Returns list of selected creator names."""
    real_creators = [c for c in creators if c["Name"] != "All"]
    options = []
    for c in real_creators:
        count = len(c["Entries"])
        options.append((c["Name"], f"{count} entr{'y' if count == 1 else 'ies'}"))

    selected_indices = multi_select_menu(options, default_on=set())
    return [real_creators[i]["Name"] for i in selected_indices]


# ── View count formatting ──────────────────────────────────────────────────


def format_views(count):
    """Format a numeric view count into a human-readable string."""
    if count is None:
        return None
    if count >= 1_000_000:
        formatted = f"{count / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}M Views"
    if count >= 100_000:
        formatted = f"{count / 1_000:.0f}"
        return f"{formatted}K Views"
    if count >= 10_000:
        formatted = f"{count / 1_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}K Views"
    if count >= 1_000:
        formatted = f"{count / 1_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}K Views"
    return f"{count:,} Views"


def format_subs(count):
    """Format a subscriber count like '20.6M Subs' or '664K Subs'."""
    if count is None:
        return None
    if count >= 1_000_000:
        formatted = f"{count / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}M Subs"
    if count >= 1_000:
        formatted = f"{count / 1_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}K Subs"
    return f"{count:,} Subs"


# ── yt-dlp fetching ───────────────────────────────────────────────────────


def fetch_video_info(url):
    """Fetch video metadata from YouTube using yt-dlp.
    Returns dict with view_count, title, webpage_url, thumbnail or None on failure."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_check_certificates": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "view_count": info.get("view_count"),
                "title": info.get("title"),
                "webpage_url": info.get("webpage_url", url),
                "thumbnail": info.get("thumbnail"),
                "upload_date": info.get("upload_date"),  # YYYYMMDD string
                "channel_id": info.get("channel_id"),
                "channel_follower_count": info.get("channel_follower_count"),
            }
    except Exception:
        return None


def fetch_with_retry(url, retries=1, delay=2.0):
    """Fetch video info with retry on failure."""
    result = fetch_video_info(url)
    if result is not None:
        return result
    for _ in range(retries):
        tprint(f"  Retrying in {delay}s...")
        time.sleep(delay)
        result = fetch_video_info(url)
        if result is not None:
            return result
    return None


def fetch_channel_videos(channel_url, max_videos=15):
    """Fetch recent video IDs and titles from a YouTube channel.
    Returns list of dicts with 'id', 'title', 'url' or empty list on failure."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_check_certificates": True,
        "extract_flat": True,
        "playlistend": max_videos,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(channel_url, download=False)
            entries = info.get("entries", [])
            results = []
            for entry in entries:
                if entry is None:
                    continue
                vid_id = entry.get("id", "")
                title = entry.get("title", "Unknown")
                url = entry.get("url") or entry.get("webpage_url") or f"https://www.youtube.com/watch?v={vid_id}"
                results.append({"id": vid_id, "title": title, "url": url})
            return results
    except Exception:
        return []


def get_channel_url_from_video(video_url):
    """Extract the channel uploads URL from a video URL using yt-dlp."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_check_certificates": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            channel_url = info.get("channel_url")
            if channel_url:
                return channel_url + "/videos"
            uploader_url = info.get("uploader_url")
            if uploader_url:
                return uploader_url + "/videos"
    except Exception:
        pass
    return None


# ── Thumbnail downloading ────────────────────────────────────────────────


def sanitize_filename(title):
    """Convert a video title into a safe filename (no extension)."""
    name = re.sub(r'[<>:"/\\|?*]', '', title)
    name = name.replace(' ', '_')
    name = re.sub(r'[\'`,!]', '', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_.')
    return name[:120] if name else "thumbnail"


def download_thumbnail(url, save_path):
    """Download an image from URL to save_path. Returns True on success."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_bytes(data)
        return True
    except Exception:
        return False


# ── String escaping ───────────────────────────────────────────────────────


def unescape_js_string(s):
    """Unescape a JS double-quoted string value."""
    s = s.replace("\\\\", "\x00")
    s = s.replace('\\"', '"')
    s = s.replace("\\n", "\n")
    s = s.replace("\x00", "\\")
    return s


def escape_js_string(s):
    """Escape a string for use inside double quotes in JS."""
    s = s.replace("\\", "\\\\")
    s = s.replace('"', '\\"')
    s = s.replace("\n", "\\n")
    return s


# ── Parsing portfolio-data.js ─────────────────────────────────────────────


def parse_data_file(filepath):
    """Parse portfolio-data.js and return a list of creator dicts."""
    text = filepath.read_text(encoding="utf-8")

    if "const views = [" not in text:
        print("ERROR: portfolio-data.js does not contain expected 'const views = [' structure.")
        sys.exit(1)

    match = re.search(r"const views = \[(.+?)\];", text, re.DOTALL)
    if not match:
        print("ERROR: Could not parse portfolio-data.js array structure.")
        sys.exit(1)

    array_content = match.group(1)

    creators = []
    creator_pattern = re.compile(
        r'\t\{\s*'
        r'"Name":\s*"([^"]*)",\s*'
        r'"Logo":\s*"([^"]*)",\s*'
        r'"Anchor":\s*"([^"]*)",\s*'
        r'"Entries":\s*\[(.*?)\],?\s*'
        r'\},?',
        re.DOTALL,
    )

    for m in creator_pattern.finditer(array_content):
        entries_text = m.group(4).strip()
        entries = []
        if entries_text:
            entry_pattern = re.compile(
                r'\{\s*'
                r'"Image":\s*"([^"]*)",\s*'
                r'"Link":\s*"([^"]*)",\s*'
                r'"Title":\s*"((?:[^"\\]|\\.)*)",\s*'
                r'"Views":\s*"([^"]*)"\s*'
                r'\}',
                re.DOTALL,
            )
            for em in entry_pattern.finditer(entries_text):
                entries.append({
                    "Image": unescape_js_string(em.group(1)),
                    "Link": unescape_js_string(em.group(2)),
                    "Title": unescape_js_string(em.group(3)),
                    "Views": unescape_js_string(em.group(4)),
                })

        creators.append({
            "Name": m.group(1),
            "Logo": m.group(2),
            "Anchor": m.group(3),
            "Entries": entries,
        })

    if not creators:
        print("ERROR: No creator blocks found in portfolio-data.js.")
        sys.exit(1)

    return creators


# ── Writing portfolio-data.js ─────────────────────────────────────────────


def write_data_file(filepath, creators):
    """Write the creators list back to portfolio-data.js in the original format."""
    lines = ["const views = ["]

    for ci, creator in enumerate(creators):
        lines.append("\t{")
        lines.append(f'\t\t"Name": "{escape_js_string(creator["Name"])}",')
        lines.append(f'\t\t"Logo": "{escape_js_string(creator["Logo"])}",')
        lines.append(f'\t\t"Anchor": "{escape_js_string(creator["Anchor"])}",')
        lines.append('\t\t"Entries": [')

        for ei, entry in enumerate(creator["Entries"]):
            lines.append("\t\t\t{")
            lines.append(f'\t\t\t\t"Image": "{escape_js_string(entry["Image"])}",')
            lines.append(f'\t\t\t\t"Link": "{escape_js_string(entry["Link"])}",')
            lines.append(f'\t\t\t\t"Title": "{escape_js_string(entry["Title"])}",')
            lines.append(f'\t\t\t\t"Views": "{escape_js_string(entry["Views"])}"')
            if ei < len(creator["Entries"]) - 1:
                lines.append("\t\t\t},")
            else:
                lines.append("\t\t\t}")

        lines.append("\t\t]")
        lines.append("\t},")

    lines.append("];")
    lines.append("")
    lines.append("for (let i = 1; i < views.length; i++) {")
    lines.append("\tviews[0].Entries.push(...views[i].Entries);")
    lines.append("\tviews[i].Anchor = views[i].Anchor.replace(/\\s/g, '');")
    lines.append("}")
    lines.append("")

    filepath.write_text("\n".join(lines), encoding="utf-8")


# ── New image detection ───────────────────────────────────────────────────


def find_new_images(creators):
    """Find image files on disk not referenced in any entry.
    Returns dict: creator folder name -> list of web-relative image paths."""
    known_images = set()
    for creator in creators:
        for entry in creator["Entries"]:
            known_images.add(entry["Image"])

    new_images = {}
    if not PORTFOLIO_IMG_DIR.exists():
        return new_images

    for folder in sorted(PORTFOLIO_IMG_DIR.iterdir()):
        if not folder.is_dir():
            continue
        folder_name = folder.name
        for ext in ("*.jpg", "*.jpeg", "*.png"):
            for img_path in folder.glob(ext):
                web_path = "/" + img_path.relative_to(PROJECT_ROOT).as_posix()
                if web_path not in known_images:
                    if folder_name not in new_images:
                        new_images[folder_name] = []
                    new_images[folder_name].append(web_path)

    return new_images


def find_creator_for_folder(creators, folder_name):
    """Find the creator dict whose Name matches the folder name, or None."""
    for creator in creators:
        if creator["Name"] == folder_name:
            return creator
    return None


# ── Helpers ──────────────────────────────────────────────────────────────


def extract_video_id(url):
    """Extract video ID from a YouTube URL."""
    m = re.search(r"(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})", url)
    return m.group(1) if m else None


# ── Update views (threaded) ──────────────────────────────────────────────


# Shared dict for collecting subscriber counts per channel_id (thread-safe writes)
_sub_counts = {}
_sub_counts_lock = threading.Lock()


def _fetch_and_update_entry(entry, index, total, retries=1):
    """Fetch info for a single entry and update it in place. Thread-safe.
    Returns (status, old_views, new_views)."""
    url = entry["Link"]

    if not url or not url.startswith("http"):
        tprint(f"  {DIM}[{index}/{total}] Skipping (no URL): {entry['Title']}{RESET}")
        return "skipped", None, None

    old_views = entry["Views"]
    short_title = entry["Title"][:45] + ("..." if len(entry["Title"]) > 45 else "")

    info = fetch_with_retry(url, retries=retries)

    if info is None:
        tprint(f"  [{index}/{total}] {short_title} {YELLOW}-> ERROR (kept existing data){RESET}")
        return "error", old_views, old_views

    # Update fields
    if info["view_count"] is not None:
        entry["Views"] = format_views(info["view_count"])
    if info["title"]:
        entry["Title"] = info["title"]
    if info["webpage_url"]:
        entry["Link"] = info["webpage_url"]
    if info.get("upload_date"):
        entry["_upload_date"] = info["upload_date"]

    # Collect subscriber count (first one wins per channel)
    ch_id = info.get("channel_id")
    ch_subs = info.get("channel_follower_count")
    if ch_id and ch_subs is not None:
        with _sub_counts_lock:
            if ch_id not in _sub_counts:
                _sub_counts[ch_id] = ch_subs

    new_views = entry["Views"]

    if old_views != new_views:
        tprint(f"  [{index}/{total}] {short_title}  {DIM}{old_views}{RESET} -> {GREEN}{new_views}{RESET}")
    else:
        tprint(f"  [{index}/{total}] {short_title}  {DIM}{new_views} (unchanged){RESET}")

    return "updated", old_views, new_views


def update_views(creators, num_threads=4):
    """Update view counts, titles, and links for all existing entries.
    Processes one creator at a time with a header, threads entries within each.
    Returns (updated, skipped, errors, changes_list)."""
    updated_count = 0
    skipped_count = 0
    error_count = 0
    changes = []

    total_entries = sum(len(c["Entries"]) for c in creators if c["Name"] != "All")
    global_index = 0

    for creator in creators:
        if creator["Name"] == "All":
            continue
        if not creator["Entries"]:
            continue

        count = len(creator["Entries"])
        print(f"\n  {CYAN}{BOLD}------ {creator['Name']} ({count} entries) ------{RESET}\n")

        # Build tasks for this creator
        creator_tasks = []
        for entry in creator["Entries"]:
            global_index += 1
            creator_tasks.append((entry, global_index))

        def _process_results(results):
            nonlocal updated_count, skipped_count, error_count
            for entry, (status, old_v, new_v) in results:
                if status == "updated":
                    updated_count += 1
                    if old_v and new_v and old_v != new_v:
                        changes.append((entry["Title"], old_v, new_v))
                elif status == "skipped":
                    skipped_count += 1
                else:
                    error_count += 1

        if num_threads <= 1:
            results = []
            for entry, idx in creator_tasks:
                result = _fetch_and_update_entry(entry, idx, total_entries)
                results.append((entry, result))
                time.sleep(0.1)
            _process_results(results)
        else:
            with ThreadPoolExecutor(max_workers=num_threads) as pool:
                future_to_entry = {}
                for entry, idx in creator_tasks:
                    fut = pool.submit(_fetch_and_update_entry, entry, idx, total_entries)
                    future_to_entry[fut] = entry

                results = []
                for fut in as_completed(future_to_entry):
                    entry = future_to_entry[fut]
                    try:
                        result = fut.result()
                    except Exception:
                        result = ("error", None, None)
                    results.append((entry, result))
                _process_results(results)

    return updated_count, skipped_count, error_count, changes


# ── Scan new images on disk ──────────────────────────────────────────────


def _normalize_for_match(text):
    """Normalize a string for fuzzy matching: split camelCase, lowercase, strip punctuation."""
    # Split camelCase/PascalCase: "PleaseDontTouch" -> "Please Dont Touch"
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    text = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', text)
    # Replace non-alphanumeric with spaces
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
    text = text.lower()
    return set(text.split())


def _match_score(filename, video_title):
    """Score how well an image filename matches a video title. Higher = better."""
    file_words = _normalize_for_match(Path(filename).stem)
    title_words = _normalize_for_match(video_title)
    if not file_words or not title_words:
        return 0
    overlap = file_words & title_words
    # Ignore very short/common words
    overlap = {w for w in overlap if len(w) > 2}
    return len(overlap)


def scan_new_images(creators, num_threads=4):
    """Scan for new thumbnail images on disk and auto-match them to
    untracked videos on each creator's channel. Fully automatic."""
    new_entry_count = 0

    print(f"\n{BOLD}Scanning for new thumbnail images...{RESET}")
    new_images = find_new_images(creators)

    if not new_images:
        print("  No new images found.")
        return 0

    total_new = sum(len(imgs) for imgs in new_images.values())
    print(f"  Found {CYAN}{total_new}{RESET} new image(s) in {len(new_images)} folder(s).\n")

    for folder_name, images in sorted(new_images.items()):
        creator = find_creator_for_folder(creators, folder_name)

        if creator is None:
            print(f"  {YELLOW}WARNING: No creator found for folder '{folder_name}'. "
                  f"Skipping {len(images)} image(s).{RESET}")
            print(f"  {DIM}(Add a new creator block manually first.){RESET}\n")
            continue

        print(f"  {BOLD}--- {creator['Name']} ---{RESET}")

        # Find a sample URL to discover the channel
        sample_url = None
        for entry in creator["Entries"]:
            if entry["Link"] and entry["Link"].startswith("http"):
                sample_url = entry["Link"]
                break

        if not sample_url:
            print(f"  {DIM}No existing video URLs to discover channel. Skipping.{RESET}\n")
            continue

        # Get channel and recent videos
        print(f"  Fetching channel videos...", end="", flush=True)
        channel_url = get_channel_url_from_video(sample_url)
        if not channel_url:
            print(f" {YELLOW}could not find channel{RESET}\n")
            continue

        known_ids = set()
        for entry in creator["Entries"]:
            vid_id = extract_video_id(entry["Link"])
            if vid_id:
                known_ids.add(vid_id)

        recent = fetch_channel_videos(channel_url, max_videos=30)
        if not recent:
            print(f" {YELLOW}could not fetch videos{RESET}\n")
            continue

        # Filter to only new (untracked) videos
        new_vids = [v for v in recent if v["id"] and v["id"] not in known_ids]
        print(f" {GREEN}{len(new_vids)} untracked video(s){RESET}\n")

        if not new_vids:
            for img_path in sorted(images):
                print(f"  {Path(img_path).name} {DIM}-> no untracked videos to match{RESET}")
            print()
            continue

        # Match each image to the best-scoring untracked video
        matched_vid_ids = set()

        for img_path in sorted(images):
            filename = Path(img_path).name
            print(f"  {CYAN}{filename}{RESET}", end="", flush=True)

            # Score against all unmatched new videos
            best_vid = None
            best_score = 0
            for vid in new_vids:
                if vid["id"] in matched_vid_ids:
                    continue
                score = _match_score(filename, vid["title"])
                if score > best_score:
                    best_score = score
                    best_vid = vid

            # If no word overlap at all, try to pair with newest unmatched video
            if best_score == 0:
                for vid in new_vids:
                    if vid["id"] not in matched_vid_ids:
                        best_vid = vid
                        break

            if best_vid is None:
                print(f" {DIM}-> no unmatched videos left{RESET}")
                continue

            matched_vid_ids.add(best_vid["id"])

            # Fetch full info for the matched video
            info = fetch_video_info(best_vid["url"])
            if info is None:
                print(f" {YELLOW}-> fetch failed{RESET}")
                continue

            title = info["title"] or best_vid["title"]
            views = format_views(info["view_count"]) if info["view_count"] is not None else "# Views"
            link = info["webpage_url"] or best_vid["url"]

            match_label = f"matched: {best_score} words" if best_score > 0 else "paired by recency"
            print(f" {GREEN}-> {title} ({views}) [{match_label}]{RESET}")

            new_entry = {
                "Image": img_path,
                "Link": link,
                "Title": title,
                "Views": views,
            }
            if info.get("upload_date"):
                new_entry["_upload_date"] = info["upload_date"]
            creator["Entries"].insert(0, new_entry)

            if len(creator["Entries"]) == 1:
                creator["Logo"] = img_path

            new_entry_count += 1

        print()

    return new_entry_count


# ── Newest videos (fully automatic) ─────────────────────────────────────


def _check_creator_channel(creator):
    """Check a single creator's channel for new videos. Thread-safe.
    Returns (creator_name, channel_url_or_None, list_of_new_video_dicts)."""
    sample_url = None
    for entry in creator["Entries"]:
        if entry["Link"] and entry["Link"].startswith("http"):
            sample_url = entry["Link"]
            break

    if not sample_url:
        return creator["Name"], None, []

    tprint(f"  Checking {BOLD}{creator['Name']}{RESET}...", end="", flush=True)

    channel_url = get_channel_url_from_video(sample_url)
    if not channel_url:
        tprint(f" {YELLOW}could not find channel{RESET}")
        return creator["Name"], None, []

    known_ids = set()
    for entry in creator["Entries"]:
        vid_id = extract_video_id(entry["Link"])
        if vid_id:
            known_ids.add(vid_id)

    recent = fetch_channel_videos(channel_url)
    if not recent:
        tprint(f" {YELLOW}could not fetch videos{RESET}")
        return creator["Name"], channel_url, []

    creator_new = [vid for vid in recent if vid["id"] and vid["id"] not in known_ids]

    if creator_new:
        tprint(f" {GREEN}{len(creator_new)} new video(s){RESET}")
    else:
        tprint(f" {DIM}up to date{RESET}")

    return creator["Name"], channel_url, creator_new


def scan_newest_videos(creators, selected_names, num_threads=4):
    """Fully automatic: check selected channels, fetch info, download thumbnails, add entries.
    Returns number of entries added."""
    targets = [c for c in creators if c["Name"] in selected_names]

    if not targets:
        print(f"  {DIM}No channels selected.{RESET}")
        return 0

    # Step 1 — discover new videos on selected channels (threaded)
    print(f"\n{BOLD}Checking YouTube channels for new uploads...{RESET}\n")

    all_new = {}  # creator_name -> list of video dicts

    if num_threads <= 1:
        for creator in targets:
            name, _, vids = _check_creator_channel(creator)
            if vids:
                all_new[name] = vids
    else:
        with ThreadPoolExecutor(max_workers=min(num_threads, len(targets))) as pool:
            futures = {pool.submit(_check_creator_channel, c): c for c in targets}
            for fut in as_completed(futures):
                try:
                    name, _, vids = fut.result()
                    if vids:
                        all_new[name] = vids
                except Exception:
                    pass

    if not all_new:
        print(f"\n  {DIM}All selected channels are up to date.{RESET}")
        return 0

    total_new = sum(len(v) for v in all_new.values())
    print(f"\n  Found {CYAN}{total_new}{RESET} new video(s). Fetching details & thumbnails...\n")

    # Step 2 — for each new video: fetch full info, download thumbnail, add entry
    added = 0

    for creator_name in sorted(all_new.keys()):
        videos = all_new[creator_name]
        creator = find_creator_for_folder(creators, creator_name)
        if not creator:
            continue

        print(f"  {BOLD}--- {creator_name} ---{RESET}")

        for vid in videos:
            vid_url = vid["url"]
            short = vid["title"][:50] + ("..." if len(vid["title"]) > 50 else "")
            print(f"  {short}", end="", flush=True)

            # Fetch full video info (title, views, thumbnail URL)
            info = fetch_video_info(vid_url)
            if info is None:
                print(f" {YELLOW}-> fetch failed, skipping{RESET}")
                continue

            title = info["title"] or vid["title"]
            views = format_views(info["view_count"]) if info["view_count"] is not None else "# Views"
            link = info["webpage_url"] or vid_url
            thumb_url = info.get("thumbnail")

            if not thumb_url:
                print(f" {YELLOW}-> no thumbnail, skipping{RESET}")
                continue

            # Download thumbnail
            filename = sanitize_filename(title) + ".jpg"
            save_dir = PORTFOLIO_IMG_DIR / creator_name
            save_path = save_dir / filename

            if not download_thumbnail(thumb_url, save_path):
                print(f" {YELLOW}-> thumbnail download failed{RESET}")
                continue

            web_path = "/" + save_path.relative_to(PROJECT_ROOT).as_posix()

            new_entry = {
                "Image": web_path,
                "Link": link,
                "Title": title,
                "Views": views,
            }
            if info.get("upload_date"):
                new_entry["_upload_date"] = info["upload_date"]
            creator["Entries"].insert(0, new_entry)

            # Update logo to newest entry
            creator["Logo"] = web_path

            added += 1
            print(f" {GREEN}-> {views} (added){RESET}")

    return added


# ── Update subscriber counts in index.html ────────────────────────────────


def update_sub_counts_html(sub_counts):
    """Update subscriber counts in index.html using collected channel data.
    sub_counts is a dict of channel_id -> follower_count.
    Returns (updated_count, details_list) where details_list has (name, old, new) tuples."""
    if not sub_counts:
        return 0, []

    html_path = PROJECT_ROOT / "index.html"
    if not html_path.exists():
        print(f"  {YELLOW}WARNING: index.html not found, skipping sub count update{RESET}")
        return 0, []

    html = html_path.read_text(encoding="utf-8")
    updated = 0
    details = []

    # Match <h3 ... class="subcount" ... data-channel-id="XXXX" ...>TEXT</h3>
    pattern = re.compile(
        r'(<h3[^>]*\bclass="subcount"[^>]*\bdata-channel-id=")([^"]+)("[^>]*>)([^<]*)(</h3>)'
    )

    def replace_sub(m):
        nonlocal updated
        prefix = m.group(1)
        channel_id = m.group(2)
        mid = m.group(3)
        old_text = m.group(4)
        suffix = m.group(5)

        if channel_id in sub_counts:
            count = sub_counts[channel_id]
            formatted = format_subs(count)
            if formatted:
                updated += 1
                details.append((channel_id, old_text.strip(), formatted))
                return f"{prefix}{channel_id}{mid}{formatted}{suffix}"
        return m.group(0)

    new_html = pattern.sub(replace_sub, html)

    if updated > 0:
        html_path.write_text(new_html, encoding="utf-8")

    return updated, details


# ── Sort entries by upload date ───────────────────────────────────────────


def sort_entries_by_date(creators):
    """Sort each creator's entries by upload date (newest first).
    Entries without a date keep their relative order but go after dated entries.
    Returns the number of creators whose order changed."""
    reordered = 0

    for creator in creators:
        if creator["Name"] == "All":
            continue
        entries = creator["Entries"]
        if len(entries) <= 1:
            continue

        # Check if any entries have dates
        has_dates = any(e.get("_upload_date") for e in entries)
        if not has_dates:
            continue

        # Separate dated and undated entries
        dated = [(e, e["_upload_date"]) for e in entries if e.get("_upload_date")]
        undated = [e for e in entries if not e.get("_upload_date")]

        # Sort dated entries newest first (YYYYMMDD sorts lexicographically)
        dated.sort(key=lambda x: x[1], reverse=True)

        new_order = [e for e, _ in dated] + undated

        # Check if order actually changed
        if [id(e) for e in new_order] != [id(e) for e in entries]:
            creator["Entries"] = new_order
            reordered += 1

    return reordered


# ── Main ──────────────────────────────────────────────────────────────────


def main():
    # ── Header ─────────────────────────────────────────────────────────

    print()
    print(f"  {CYAN}{BOLD}{'=' * 56}{RESET}")
    print(f"  {CYAN}{BOLD}  Ghillie.xyz Portfolio Data Updater{RESET}")
    print(f"  {CYAN}{BOLD}{'=' * 56}{RESET}")

    if not DATA_FILE.exists():
        print(f"\n  {YELLOW}ERROR: Data file not found: {DATA_FILE}{RESET}")
        sys.exit(1)

    # Parse
    print(f"\n  Reading {DATA_FILE.name}...")
    creators = parse_data_file(DATA_FILE)

    total_entries = sum(len(c["Entries"]) for c in creators if c["Name"] != "All")
    creator_count = len(creators) - 1
    print(f"  Found {CYAN}{creator_count}{RESET} creators, {CYAN}{total_entries}{RESET} entries total.")

    # ── Mode selection ─────────────────────────────────────────────────

    cli_mode = False
    if "--views-only" in sys.argv:
        mode = "views_only"
        cli_mode = True
    elif "--full" in sys.argv:
        mode = "full"
        cli_mode = True
    elif "--newest" in sys.argv:
        mode = "newest"
        cli_mode = True
    else:
        mode = select_mode()

    # ── Thread selection ───────────────────────────────────────────────

    num_threads = None
    for i, arg in enumerate(sys.argv):
        if arg == "--threads" and i + 1 < len(sys.argv):
            try:
                num_threads = int(sys.argv[i + 1])
            except ValueError:
                pass

    if num_threads is None:
        if not cli_mode:
            print(f"\n  {BOLD}Threads:{RESET}")
            num_threads = select_threads()
        else:
            num_threads = 4

    # ── Channel selection (newest mode only) ───────────────────────────

    selected_channels = None
    if mode == "newest":
        if not cli_mode:
            print(f"\n  {BOLD}Select channels to check for new uploads:{RESET}")
            selected_channels = select_channels(creators)
        else:
            # CLI mode: select all channels
            selected_channels = [c["Name"] for c in creators if c["Name"] != "All"]

    print(f"\n{'-' * 60}")

    # ── Execute: update views ──────────────────────────────────────────

    thread_label = f" ({num_threads} thread{'s' if num_threads != 1 else ''})" if num_threads > 1 else ""
    print(f"\n{BOLD}Updating view counts, titles & links{thread_label}...{RESET}\n")
    updated_count, skipped_count, error_count, changes = update_views(creators, num_threads=num_threads)

    # ── Execute: new images (full mode) ────────────────────────────────

    new_image_count = 0
    if mode == "full":
        new_image_count = scan_new_images(creators, num_threads=num_threads)

    # ── Execute: newest videos (newest mode) ───────────────────────────

    new_video_count = 0
    if mode == "newest" and selected_channels:
        new_video_count = scan_newest_videos(creators, selected_channels, num_threads=num_threads)

    # ── Sort entries by upload date (newest first) ─────────────────────

    sorted_count = sort_entries_by_date(creators)
    if sorted_count:
        print(f"\n{BOLD}Sorted entries by upload date{RESET} ({CYAN}{sorted_count}{RESET} creators reordered)")

    # ── Write output ──────────────────────────────────────────────────

    print(f"\n{BOLD}Writing {DATA_FILE.name}...{RESET}")
    write_data_file(DATA_FILE, creators)
    print(f"  {GREEN}Saved to {DATA_FILE.relative_to(PROJECT_ROOT)}{RESET}")

    # ── Update subscriber counts in index.html ────────────────────────

    sub_updated = 0
    sub_details = []
    if _sub_counts:
        print(f"\n{BOLD}Updating subscriber counts in index.html...{RESET}")
        sub_updated, sub_details = update_sub_counts_html(_sub_counts)
        if sub_updated:
            for ch_id, old_text, new_text in sub_details:
                print(f"  {ch_id[:12]}...  {DIM}{old_text}{RESET} -> {GREEN}{new_text}{RESET}")
            print(f"  {GREEN}Updated {sub_updated} subscriber count(s) in index.html{RESET}")
        else:
            print(f"  {DIM}No matching channels found in index.html{RESET}")

    # ── Summary ───────────────────────────────────────────────────────

    total_new = new_image_count + new_video_count

    print(f"\n  {CYAN}{BOLD}{'=' * 56}{RESET}")
    print(f"  {CYAN}{BOLD}  Summary{RESET}")
    print(f"  {CYAN}{BOLD}{'=' * 56}{RESET}")
    print(f"  {GREEN}Updated:  {updated_count} entries{RESET}")
    if changes:
        print(f"  {GREEN}Changed:  {len(changes)} view counts differ{RESET}")
    if skipped_count:
        print(f"  {DIM}Skipped:  {skipped_count} entries (no URL){RESET}")
    if error_count:
        print(f"  {YELLOW}Errors:   {error_count} entries (kept existing data){RESET}")
    if mode in ("full", "newest"):
        print(f"  {GREEN}New:      {total_new} entries added{RESET}")
    if sub_updated:
        print(f"  {GREEN}Subs:     {sub_updated} channel(s) updated in index.html{RESET}")
    print(f"\n  {DIM}Output: {DATA_FILE}{RESET}")
    print(f"  {CYAN}{BOLD}{'=' * 56}{RESET}\n")


if __name__ == "__main__":
    main()

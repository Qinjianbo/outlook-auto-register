#!/bin/bash
# zo3 / gcore：toml + 日志目录权限
set -euo pipefail
# 项目根目录：优先用 EMAIL_REGISTER_ROOT，否则按脚本自身位置推导
# （脚本在 <项目根>/deploy/ 下，往上一级就是项目根），不再写死路径。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${EMAIL_REGISTER_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$ROOT"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq 2>/dev/null || apt-get update -qq 2>/dev/null || true
sudo apt-get install -y -qq python3-toml python3-yaml python3-requests 2>/dev/null || \
  apt-get install -y -qq python3-toml python3-yaml python3-requests 2>/dev/null || true
pip3 install -q toml pyyaml requests 2>/dev/null || \
  pip3 install --break-system-packages -q toml pyyaml requests 2>/dev/null || true
mkdir -p "$ROOT/runtime_outlook/logs"
if [[ -d "$ROOT/runtime_outlook" ]]; then
  if command -v sudo >/dev/null && [[ "$(id -u)" -ne 0 ]]; then
    sudo chown -R "$(whoami):$(whoami)" "$ROOT/runtime_outlook" 2>/dev/null || true
  fi
  chmod -R u+rwX "$ROOT/runtime_outlook" 2>/dev/null || true
fi
python3 -c "import toml; print('toml ok')"
echo "fix_node_deps done $ROOT"
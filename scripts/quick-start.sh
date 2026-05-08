#!/usr/bin/env bash
# Mission Control one-click launcher

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_MODE="dev"
ENV_FILE="$ROOT_DIR/.env"
ENV_SAMPLE="$ROOT_DIR/.env.example"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
SKIP_INSTALL=0
SKIP_ENV=0
AUTO_PORT=0
KILL_CONFLICT=1
ALLOW_UNSUPPORTED_NODE=0
MIN_NODE_MAJOR=22

color() {
  printf '\033[%sm%s\033[0m\n' "$1" "$2"
}

info() { color "1;34" "[MC] $*"; }
warn() { color "1;33" "[WARN] $*"; }
error() { color "1;31" "[ERROR] $*"; }

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/quick-start.sh [options]

Options:
  --dev                 开发模式启动 (默认)
  --prod                先 build 再 start（生产模式）
  --port <port>         指定端口（默认 3000）
  --host <host>         指定监听 host（默认 127.0.0.1）
  --skip-install        跳过依赖安装步骤
  --skip-env            跳过 .env 创建步骤
  --auto-port           当端口被占用时自动递增到空闲端口
  --no-kill-conflict    检测到端口冲突时不杀掉占用进程
  --allow-unsupported-node
                        当 Node 版本低于 22 时仍尝试启动（不推荐）
  -h, --help            显示帮助

Examples:
  bash scripts/quick-start.sh
  bash scripts/quick-start.sh --prod --port 4000
USAGE
}

use_project_node() {
  local desired_version=""
  if [[ -f "$ROOT_DIR/.nvmrc" ]]; then
    desired_version="$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")"
  elif [[ -f "$ROOT_DIR/.node-version" ]]; then
    desired_version="$(tr -d '[:space:]' < "$ROOT_DIR/.node-version")"
  fi

  if [[ -z "$desired_version" ]]; then
    return
  fi

  if command -v node >/dev/null 2>&1; then
    local current_major
    current_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "$current_major" -ge "$MIN_NODE_MAJOR" ]]; then
      return
    fi
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    if nvm use "$desired_version" >/dev/null 2>&1; then
      info "已切换到项目 Node.js $(node -v)"
      return
    fi

    warn "已检测到项目需要 Node $desired_version，但本机 nvm 未能切换到该版本"
  fi
}

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    error "未检测到 node，请先安装 Node.js >= ${MIN_NODE_MAJOR}"
    exit 1
  fi

  local node_major
  node_major=$(node -v | sed 's/^v//' | cut -d. -f1)
  if [[ "$node_major" -lt "$MIN_NODE_MAJOR" ]]; then
    if [[ "$ALLOW_UNSUPPORTED_NODE" -eq 1 ]]; then
      warn "检测到 Node.js $(node -v)，低于推荐版本 ${MIN_NODE_MAJOR}，将跳过内建版本检查直接启动"
      return
    fi

    error "当前 Node.js 版本为 $(node -v)，需要 >= 22"
    exit 1
  fi
  info "Node.js $(node -v)"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    info "pnpm $(pnpm -v)"
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    info "未检测到 pnpm，使用 corepack 安装并启用..."
    corepack enable
    corepack prepare pnpm@latest --activate
    info "pnpm $(pnpm -v)"
    return
  fi

  error "未检测到 pnpm 或 corepack，请先安装 pnpm"
  exit 1
}

ensure_env() {
  if [[ "$SKIP_ENV" -eq 1 ]]; then
    return
  fi

  if [[ -f "$ENV_FILE" ]]; then
    return
  fi

  if [[ -f "$ENV_SAMPLE" ]]; then
    info "未检测到 .env，已从 .env.example 生成"
    cp "$ENV_SAMPLE" "$ENV_FILE"
  else
    warn "未检测到 .env.example，跳过环境变量文件创建"
  fi
}

is_port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      return 0
    fi
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "sport = :$port" 2>/dev/null | tail -n +2 | grep -qE "[:.]${port}[[:space:]]"; then
      return 0
    fi
  fi

  if command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}$"; then
      return 0
    fi
  fi

  if (exec 3<>"/dev/tcp/$HOST/$port") 2>/dev/null; then
    exec 3>&-
    return 0
  fi

  return 1
}

port_processes() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    local lsof_pids
    lsof_pids="$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u)"
    if [[ -n "$lsof_pids" ]]; then
      printf '%s\n' "$lsof_pids"
      return
    fi
  fi

  if command -v fuser >/dev/null 2>&1; then
    local fuser_pids
    fuser_pids="$(fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | sed 's/://g' | grep -E '^[0-9]+$' | sort -u || true)"
    if [[ -n "$fuser_pids" ]]; then
      printf '%s\n' "$fuser_pids"
      return
    fi
  fi

  if command -v ss >/dev/null 2>&1; then
    local ss_pids
    ss_pids="$(ss -ltnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
    if [[ -n "$ss_pids" ]]; then
      printf '%s\n' "$ss_pids"
      return
    fi
  fi

  return
}

kill_conflict_processes() {
  local port="$1"
  local pids
  pids="$(port_processes "$port" | tr '\n' ' ' | xargs)"

  if [[ -z "$pids" ]]; then
    warn "端口 $port 被占用，但未能识别到进程 PID，改用按端口清理"

    if command -v fuser >/dev/null 2>&1; then
      fuser -TERM -k -n tcp "$port" >/dev/null 2>&1 || true
      sleep 2
      if ! is_port_in_use "$port"; then
        return 0
      fi

      fuser -KILL -k -n tcp "$port" >/dev/null 2>&1 || true
      sleep 1
      if ! is_port_in_use "$port"; then
        return 0
      fi

      if command -v sudo >/dev/null 2>&1; then
        warn "普通权限未能清理端口 $port，尝试 sudo fuser（可能需要输入密码）"
        sudo fuser -TERM -k -n tcp "$port" >/dev/null 2>&1 || true
        sleep 2
        if ! is_port_in_use "$port"; then
          return 0
        fi

        sudo fuser -KILL -k -n tcp "$port" >/dev/null 2>&1 || true
        sleep 1
        if ! is_port_in_use "$port"; then
          return 0
        fi
      fi
    fi

    return 1
  fi

  info "即将结束端口 $port 上的进程: $pids"
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  local i=0
  while ((i < 10)); do
    if ! is_port_in_use "$port"; then
      return 0
    fi
    ((i++))
    sleep 1
  done

  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done

  local timeout=0
  while ((timeout < 10)); do
    if ! is_port_in_use "$port"; then
      return 0
    fi
    ((timeout++))
    sleep 1
  done

  return 1
}

ensure_free_port() {
  local check_port=$PORT
  local candidate

  if ! is_port_in_use "$check_port"; then
    return
  fi

  local pids
  pids="$(port_processes "$check_port" | tr '\\n' ' ' | xargs)"
  if [[ -n "$pids" ]]; then
    warn "端口 $check_port 已被占用，进程: $pids"
  else
    warn "端口 $check_port 已被占用（当前环境无法识别进程）"
  fi

  if [[ "$KILL_CONFLICT" -eq 1 ]]; then
    if kill_conflict_processes "$check_port"; then
      info "已清理端口 $check_port 的占用进程"
      return
    fi
    warn "清理端口 $check_port 失败"
  else
    warn "当前未启用冲突进程自动清理"
  fi

  if [[ "$AUTO_PORT" -eq 0 ]]; then
    error "请手动改端口（如：bash scripts/quick-start.sh --port 3001）或加 --auto-port 自动切换"
    exit 1
  fi

  candidate=$((check_port + 1))
  while is_port_in_use "$candidate"; do
    candidate=$((candidate + 1))
    if [[ "$candidate" -ge 10000 ]]; then
      error "未能在 $check_port~9999 找到空闲端口"
      exit 1
    fi
  done

  info "检测到端口占用，已自动切换到空闲端口 $candidate"
  PORT="$candidate"
}

ensure_deps() {
  if [[ "$SKIP_INSTALL" -eq 1 ]]; then
    return
  fi

  cd "$ROOT_DIR"

  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    return
  fi

  info "开始安装依赖"
  if ! pnpm install --frozen-lockfile; then
    warn "--frozen-lockfile 失败，改为 pnpm install"
    pnpm install
  fi
  pnpm rebuild better-sqlite3 >/dev/null 2>&1 || true
}

run() {
  cd "$ROOT_DIR"

  local using_node_check="true"
  if [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt "$MIN_NODE_MAJOR" ]]; then
    using_node_check="false"
  fi

  if [[ "$RUN_MODE" == "prod" ]]; then
    info "生产模式：构建并启动"
    if [[ "$using_node_check" == "true" ]]; then
      PORT="$PORT" pnpm build
      info "启动中: http://$HOST:$PORT"
      HOST="$HOST" PORT="$PORT" pnpm start
    else
      node node_modules/next/dist/bin/next build
      info "启动中: http://$HOST:$PORT"
      node node_modules/next/dist/bin/next start --hostname "$HOST" --port "$PORT"
    fi
  else
    info "开发模式：启动中"
    info "地址: http://$HOST:$PORT/setup"
    if [[ "$using_node_check" == "true" ]]; then
      HOST="$HOST" PORT="$PORT" pnpm dev
    else
      node node_modules/next/dist/bin/next dev --hostname "$HOST" --port "$PORT"
    fi
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      RUN_MODE="dev"
      shift
      ;;
    --prod)
      RUN_MODE="prod"
      shift
      ;;
    --port)
      if [[ $# -lt 2 ]]; then
        error "--port 需要一个参数"
        usage
        exit 1
      fi
      PORT="$2"
      shift 2
      ;;
    --host)
      if [[ $# -lt 2 ]]; then
        error "--host 需要一个参数"
        usage
        exit 1
      fi
      HOST="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-env)
      SKIP_ENV=1
      shift
      ;;
    --auto-port)
      AUTO_PORT=1
      shift
      ;;
    --no-kill-conflict)
      KILL_CONFLICT=0
      shift
      ;;
    --allow-unsupported-node)
      ALLOW_UNSUPPORTED_NODE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"
use_project_node
require_node
ensure_pnpm
ensure_env
ensure_deps
ensure_free_port
run

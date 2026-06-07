#!/usr/bin/env bash
# 一键将本项目的全部 8 个 Skill + SOUL.md 人设部署到 OpenClaw
# 用法：bash install.sh

set -e

SKILLS_DIR="${HOME}/.openclaw/skills"
SOUL_DIR="${HOME}/.openclaw/soul"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 8 个核心 Skill（赛题要求至少 3 个，本项目 8 个全部安装）
SKILLS=(
  "food-order-recommendation"
  "commute-planning-assistant"
  "leisure-activity-recommendation"
  "life-service-query"
  "weather-awareness"
  "deal-finder"
  "always-on-scheduler"
  "user-preference-memory"
)

# 共享数据层（不是 Skill，但需要被复制）
SHARED="shared"

echo "=========================================="
echo " OpenClaw 本地生活管家 · 一键部署"
echo "=========================================="
echo "源目录: ${PROJECT_DIR}/skills"
echo "目标目录: ${SKILLS_DIR}"
echo ""

# 检查源目录
if [ ! -d "${PROJECT_DIR}/skills" ]; then
  echo "[错误] 未找到 ${PROJECT_DIR}/skills 目录"
  exit 1
fi
# 确保目标目录存在
mkdir -p "${SKILLS_DIR}"

# 复制 / 同步 8 个 Skill
echo "[1/4] 复制 8 个 Skill..."
for s in "${SKILLS[@]}"; do
  src="${PROJECT_DIR}/skills/${s}"
  dst="${SKILLS_DIR}/${s}"
  if [ ! -d "${src}" ]; then
    echo "  [跳过] ${s} (源目录不存在)"
    continue
  fi
  # 用 rsync 同步（已存在则更新），不可用则用 cp -R
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${src}/" "${dst}/"
  else
    rm -rf "${dst}"
    cp -R "${src}" "${dst}"
  fi
  echo "  [完成] ${s}"
done
# 复制 shared 数据层
echo "[2/4] 复制共享数据层..."
src="${PROJECT_DIR}/skills/${SHARED}"
dst="${SKILLS_DIR}/${SHARED}"
if [ -d "${src}" ]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${src}/" "${dst}/"
  else
    rm -rf "${dst}"
    cp -R "${src}" "${dst}"
  fi
  echo "  [完成] ${SHARED}"
fi
# 复制 SOUL.md 人设
echo "[3/4] 部署 SOUL.md 人设..."
mkdir -p "${SOUL_DIR}"
if [ -f "${PROJECT_DIR}/SOUL.md" ]; then
  cp "${PROJECT_DIR}/SOUL.md" "${SOUL_DIR}/default.md"
  echo "  [完成] SOUL.md → ${SOUL_DIR}/default.md"
else
  echo "  [跳过] SOUL.md 不存在"
fi
# 验证
echo "[4/4] 验证..."
echo ""
echo "已部署的 Skill 列表："
ls "${SKILLS_DIR}" | grep -E "food-order|commute|leisure|life-service|weather|always-on|user-pref|deal-finder" || echo "  (无)"
echo ""
echo "SOUL.md 人设："
cat "${SOUL_DIR}/default.md" 2>/dev/null | head -3 || echo "  (未部署)"

echo ""
echo "=========================================="
echo " 部署完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "  1. openclaw gateway restart     # 重启网关加载人设"
echo "  2. openclaw skills check        # 验证 8 个 Skill 都 ready"
echo "  3. openclaw skills list | grep <name>   # 查看具体某个"
echo ""

# DeepSeek Dock 0.3.17 宣传素材

中文实录主版，1920×1080、30 fps。片头和片尾各3秒，6个功能章节各10秒，总长66秒。每个章节另外导出1200×675、15 fps静音GIF，直接使用实录画面，方便看清界面文字。

## 实录文件

六段原始录屏随工程保存在 `assets/sources/`。`manifest.json` 使用这些相对路径，克隆仓库后即可重建媒体。

| 文件 | 展示内容 |
| --- | --- |
| `01-dock.mp4` | Dock入口与应用固定 |
| `02-search.mp4` | 搜索与通知 |
| `03-pins-draft.mp4` | 跨工作区置顶与Home草稿 |
| `04-split-panels.mp4` | 左右窗格与内容预览 |
| `05-floating.mp4` | 悬浮输入、单击标题展开、右下角恢复 |
| `06-resize-snap.mp4` | 宽高调节、拖动吸附、窄版合并设置 |

原录屏建议1280×720，界面采用浅色主题，包含指针操作。每章的 `durationSeconds`、`sourceStartSeconds`、`sourceEndSeconds` 在 `manifest.json` 调整。所选素材区间长于章节时完整加速播放，短于章节时保留末帧补足。

## 重建与导出

需要 Node.js 22 或更新版本、FFmpeg（含 `ffprobe`）及 Python 3。Python 环境需安装 Pillow 和支持 WOFF2 的 FontTools。

```bash
python3 -m pip install pillow 'fonttools[woff]'
```

```bash
cd demo/promo-2026-11
python3 build.py
npm run check
npm run render
```

`build.py` 生成可编辑HyperFrames组合、统一录屏片段和循环交叉淡化音乐。`render.py` 渲染主版、从统一录屏片段逐章导出GIF，随后运行媒体验证。GIF的标题和说明写入 `exports.json`。成片、GIF、日志及验证报告保存在 `../output/promo-0.3.17/final/`。

仅改动文案或尚未录制时，可以运行 `python3 build.py --composition-only`。新增字符时，从完整Noto Sans SC字体重建子集。

```bash
python3 build.py --composition-only --font-source /absolute/path/NotoSansSC-Regular.ttf
```

已有主版需要重导GIF时，运行 `npm run gifs`。

## 素材出处

实录画面由当前插件界面录制，组合右上角显示「本地实录 · 演示数据」。字体为Noto Sans SC，字库包含全部manifest文案及ASCII字符，许可在 `assets/fonts/OFL.txt`。

背景音乐复用项目内 `../assets/audio/dock-bgm.mp3`，标题为Quiet Momentum，由ChatCut/Mureka9生成。来源与许可记录在 `../assets/audio/README.md`。截取1.2–42.5秒中段，以2秒交叉淡化循环，开头淡入0.8秒，结尾淡出2.5秒。

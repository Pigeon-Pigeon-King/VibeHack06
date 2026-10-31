/* 所有路径都相对于 index.html。null 会保留明确的布局占位，不请求不存在的文件。
 * 例如 world: "assets/screens/world.jpg"。
 * 占位插画仅用于版式，不代表实机画面。不要把它们用于实际游戏或宣传片取景。
 */
window.GANYMEDE_MEDIA = {
  title: "assets/title.png",
  images: {
    world: null,
    wen: null,
    zhou: null,
    promise: null,
    cover: null,
    carry: null,
    door: null,
    ending: null
  },
  trailer: null, // 以后替换为 "assets/trailer-45s.mp4"
  trailerCaptions: null, // 可选 WebVTT，例如 "assets/trailer.zh-CN.vtt"
  audioPreview: "assets/trailer-audio-preview.mp3", // 仅演讲者备注窗口提供试听；不自动播放
  preeditPreview: "assets/trailer-preedit-45s.mp4" // 有占位标记的预剪稿，仅在备注提供；不是实机成片
};

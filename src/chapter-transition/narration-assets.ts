import type { NarrationAsset } from './HtmlNarrationPlayer';

export interface NarrationAssetWithDigest extends NarrationAsset {
  readonly sha256: string;
}

/** Frozen selected takes from public/audio/chapter-bridge-01/manifest.json.
 * Only playback fields enter the bundle; original audio and provenance stay in public.
 * Durations are metadata: HtmlNarrationPlayer advances only on the actual ended event.
 */
export const NARRATION_ASSETS = [
  {
    "cueId": "opening-campaign-01",
    "text": "木卫三经过几代人的改造，有了可呼吸的空气；冰脊港的居民靠供热设施抵御寒冷。",
    "file": "audio/opening-campaign/opening-campaign-01.t01.mp3",
    "durationSeconds": 7.248,
    "sha256": "b3fccbac77c6bdd452fa32458c9211833350789855933600a2e54b18a390a681"
  },
  {
    "cueId": "opening-campaign-02",
    "text": "当地爆发叛乱，工区居民挤进避难所，驻军守着入口，准备掩护人们从检修通道撤离。",
    "file": "audio/opening-campaign/opening-campaign-02.t01.mp3",
    "durationSeconds": 7.248,
    "sha256": "2d6f881061121434d6a1f8575e6cbec2717317c70bb5031517c5628ff3c99019"
  },
  {
    "cueId": "opening-campaign-03",
    "text": "九岁的陆闻川和父亲陆建平待在主厅，母亲许岚去了医院。",
    "file": "audio/opening-campaign/opening-campaign-03.t01.mp3",
    "durationSeconds": 5.184,
    "sha256": "7689faa1d826716d0776873ddb54a8622ec4d21353ea57df9c34264551b01704"
  },
  {
    "cueId": "opening-campaign-04",
    "text": "检修门前的过道被一张床垫堵住，陆建平准备过去帮人清出通路。",
    "file": "audio/opening-campaign/opening-campaign-04.t01.mp3",
    "durationSeconds": 6.456,
    "sha256": "eeb27e75ac5c0832a15b4c39b30bb506bfe45ca8231a151d8ec9fd39e1dc074c"
  },
  {
    "cueId": "bridge-s01-s02-01",
    "text": "父亲拾枪冲向防线，闻川随人流挤过西侧隔断，进了撤离通道。",
    "file": "audio/bridge-s01-s02/bridge-s01-s02-01.t01.mp3",
    "durationSeconds": 6.144,
    "sha256": "5265eab6f0d22d5102acadd7c7a8737b263f8cd46cfdc4bb47666d0bd31131c8"
  },
  {
    "cueId": "bridge-s01-s02-02",
    "text": "回到同一次失守稍早的时刻，年轻的周延接下了主厅西侧的防守。",
    "file": "audio/bridge-s01-s02/bridge-s01-s02-02.t01.mp3",
    "durationSeconds": 5.568,
    "sha256": "7f7b6f58e68ec95c9186530d8aa879094d9a225254bfd78ec28bf6d865ddb139"
  },
  {
    "cueId": "bridge-s01-s02-03",
    "text": "他要打开检修门，护送居民穿过下一道隔断。",
    "file": "audio/bridge-s01-s02/bridge-s01-s02-03.t01.mp3",
    "durationSeconds": 4.128,
    "sha256": "5efa26e5983acb18ba6ea4c53b740cf76c37295a270c6fabf2f018c9d542340d"
  },
  {
    "cueId": "bridge-s02-s03-01",
    "text": "周延从那场失守中活了下来。",
    "file": "audio/bridge-s02-s03/bridge-s02-s03-01.t01.mp3",
    "durationSeconds": 3.024,
    "sha256": "c73afc665aeae011fdef02ffadc8397a05089df2f171584d9ba2e418ea23f2de"
  },
  {
    "cueId": "bridge-s02-s03-02",
    "text": "十年后，闻川已长大成人，和周延一起为港区的接应行动做准备。",
    "file": "audio/bridge-s02-s03/bridge-s02-s03-02.t01.mp3",
    "durationSeconds": 5.424,
    "sha256": "7958f5bca0ea0f2d8f9d95921c1f60401633e9201e5cfb490f116fbb53f8a034"
  },
  {
    "cueId": "bridge-s02-s03-03",
    "text": "集合之前，闻川还要修好通风，把护理物资交到许岚手里。",
    "file": "audio/bridge-s02-s03/bridge-s02-s03-03.t01.mp3",
    "durationSeconds": 5.256,
    "sha256": "adfaa5566d3f28a556427a090bcd291f082a1ab54c496c3e6fed0ec90d85d006"
  },
  {
    "cueId": "bridge-s03-s04-01",
    "text": "闻川与周延约好共享情报，等护送人员到站，再安排接防换班。",
    "file": "audio/bridge-s03-s04/bridge-s03-s04-01.t01.mp3",
    "durationSeconds": 5.808,
    "sha256": "e89a45b4af0fb53fd7f311f994bb08f1fb0a05313d7ad0efc681f799e79e249d"
  },
  {
    "cueId": "bridge-s03-s04-02",
    "text": "夜班交完，闻川带上装备，与郑铎进入占领区。",
    "file": "audio/bridge-s03-s04/bridge-s03-s04-02.t01.mp3",
    "durationSeconds": 4.464,
    "sha256": "5cd10f1e85e55c458277572acbbdd8e4ba874689984d8ca93032aa1b4198d89a"
  },
  {
    "cueId": "bridge-s03-s04-03",
    "text": "他们要先接回熟悉港口设备的技工，恢复接收中心的运作。",
    "file": "audio/bridge-s03-s04/bridge-s03-s04-03.t01.mp3",
    "durationSeconds": 4.848,
    "sha256": "bbd58df2a82964f2b8801c7aa0c0af33572841344c34df0a870abf6468103039"
  },
  {
    "cueId": "bridge-s04-s05-01",
    "text": "港务人员已在转运位交接，闻川也答应把罗敬的家属送到安全地点。",
    "file": "audio/bridge-s04-s05/bridge-s04-s05-01.t02.mp3",
    "durationSeconds": 5.496,
    "sha256": "aceff97d4a7b71993337fa9557cf826bf67d65bc429d474d0f0fcf11ca16dfd4"
  },
  {
    "cueId": "bridge-s04-s05-02",
    "text": "北闸的维修工还在等撤离，周延要守住来路，掩护他们沿西侧后路退入内门。",
    "file": "audio/bridge-s04-s05/bridge-s04-s05-02.t01.mp3",
    "durationSeconds": 6.216,
    "sha256": "9f0d9b210abe628ac484072409ceb3d65d039f5873a83fcbf3f7e1c138d31df7"
  },
  {
    "cueId": "bridge-s05-s06-01",
    "text": "北闸的维修工已退到内侧，周延和郑铎也沿后线撤回。",
    "file": "audio/bridge-s05-s06/bridge-s05-s06-01.t01.mp3",
    "durationSeconds": 5.328,
    "sha256": "a6409aaea2347f047e25ecd3c3a9b48ca6a5a6ae9a573b3e9e81ea0db71d26a7"
  },
  {
    "cueId": "bridge-s05-s06-02",
    "text": "周延把敌军机动部队仍在港区的消息传给闻川，闻川继续协助转运。",
    "file": "audio/bridge-s05-s06/bridge-s05-s06-02.t01.mp3",
    "durationSeconds": 6.144,
    "sha256": "af4123776cc1b6ae2795a214e6bfdb83ac50132b2ab4af6b6e3a378874ae3375"
  },
  {
    "cueId": "bridge-s05-s06-03",
    "text": "西货廊的患者车堵在一道转接门前，正等闻川排除故障。",
    "file": "audio/bridge-s05-s06/bridge-s05-s06-03.t01.mp3",
    "durationSeconds": 5.256,
    "sha256": "df030e32eeae4829a3fc965a25e487f0e7ef344e52f52522d67df44dc9aa3145"
  },
  {
    "cueId": "bridge-s06-s07-01",
    "text": "患者通过转接门后，闻川为周延扣下邵原转移预告的事与他争执，随后跟罗敬回去做维修。",
    "file": "audio/bridge-s06-s07/bridge-s06-s07-01.t01.mp3",
    "durationSeconds": 7.656,
    "sha256": "1b0d1ba6cd67f5b51612843607bf5acda911d0f9b4fe0928e6af779a482d6396"
  },
  {
    "cueId": "bridge-s06-s07-02",
    "text": "东侧机动队正逼近检修台，周延要掩护维修人员经泵房退入内门。",
    "file": "audio/bridge-s06-s07/bridge-s06-s07-02.t01.mp3",
    "durationSeconds": 6.456,
    "sha256": "a97a19e6dd67100f9747311eaae948b3ec0918e463045c3c8fd6c45c1e9ba211"
  },
  {
    "cueId": "bridge-s07-s08-01",
    "text": "维修组退回内门，孟齐的分流路线也走通了。",
    "file": "audio/bridge-s07-s08/bridge-s07-s08-01.t01.mp3",
    "durationSeconds": 4.128,
    "sha256": "e9cc27c79a426ab0996d28422a3a72f71c46d97768f9dc5b29ceea0c62862d21"
  },
  {
    "cueId": "bridge-s07-s08-02",
    "text": "周延把完整报告连同来源交给闻川，并把自己列入换班名单。",
    "file": "audio/bridge-s07-s08/bridge-s07-s08-02.t01.mp3",
    "durationSeconds": 5.496,
    "sha256": "d02debd6e21cdf7e56a317ef15894fede8774cd5694fa83db3b210ff8db3f556"
  },
  {
    "cueId": "bridge-s07-s08-03",
    "text": "闻川回到接应区，要先核对罗敬家属的安置，再接下一段护送。",
    "file": "audio/bridge-s07-s08/bridge-s07-s08-03.t01.mp3",
    "durationSeconds": 5.424,
    "sha256": "e950211d30b2594054ba0cebe59df2d5dba1a4152acfc2c7c038951eb037bcb9"
  },
  {
    "cueId": "bridge-s08-s09-01",
    "text": "患者和陪护已到旧检修站，名单核对齐了，孟齐带着接防组返回北闸。",
    "file": "audio/bridge-s08-s09/bridge-s08-s09-01.t01.mp3",
    "durationSeconds": 6.144,
    "sha256": "b280beb689016d77acd5e90540f4e5a1371df759f2facb4677c164b15baa0510"
  },
  {
    "cueId": "bridge-s08-s09-02",
    "text": "周延守住后线，等同伴进到阵位，接过通信和防区，他这一组就能撤回。",
    "file": "audio/bridge-s08-s09/bridge-s08-s09-02.t02.mp3",
    "durationSeconds": 6.696,
    "sha256": "22bee8380d2510d187ab2d425657f1ec48af10c41957acae56e0ec75e9199327"
  },
  {
    "cueId": "bridge-s09-s10-01",
    "text": "接防队员留守阵位，周延让郑铎调好了护具，也给家里留了回复。",
    "file": "audio/bridge-s09-s10/bridge-s09-s10-01.t01.mp3",
    "durationSeconds": 5.256,
    "sha256": "4a9f6bb722795d84ba1775a72eb22daf7c6439cc883baf55d861bf66dcfc31d7"
  },
  {
    "cueId": "bridge-s09-s10-02",
    "text": "周延跟孟齐、郑铎继续撤回，要穿过设备交叉口，去旧检修站报到。",
    "file": "audio/bridge-s09-s10/bridge-s09-s10-02.t01.mp3",
    "durationSeconds": 5.736,
    "sha256": "4bb18810e56302dda75ebf32f5b5a67bd3d5a2772fd7dac6f6ad845f0718fed1"
  },
  {
    "cueId": "bridge-s10-s11-01",
    "text": "郑铎和医护沿着保住的西货廊，把周延与孟齐送到了旧检修站。",
    "file": "audio/bridge-s10-s11/bridge-s10-s11-01.t02.mp3",
    "durationSeconds": 6.288,
    "sha256": "89416ede1a9b5b6fdba8d791c906db22e302a83ba59fac6d5236f6e7880635d0"
  },
  {
    "cueId": "bridge-s10-s11-02",
    "text": "闻川来到救护点，郑铎带着装备和转运记录在等他，里面的医护已开始救治。",
    "file": "audio/bridge-s10-s11/bridge-s10-s11-02.t01.mp3",
    "durationSeconds": 5.736,
    "sha256": "9e25aeab5113380dd1288ad48e823c9be3f1ebbffa7ffb8ec4fc728dcb0ac997"
  },
  {
    "cueId": "bridge-s11-s12-01",
    "text": "医师确认周延抢救失败，孟齐继续留在救护点治疗。",
    "file": "audio/bridge-s11-s12/bridge-s11-s12-01.t01.mp3",
    "durationSeconds": 4.608,
    "sha256": "a9aca12254c268d727a429970df35a9f4dbc99f63e285898641b3575bd8b5ff1"
  },
  {
    "cueId": "bridge-s11-s12-02",
    "text": "闻川和郑铎带上医疗需求单，准备向接收台报告伤亡和通路情况；罗敬正在那边等他们。",
    "file": "audio/bridge-s11-s12/bridge-s11-s12-02.t01.mp3",
    "durationSeconds": 7.344,
    "sha256": "8605fa569a222787cffd9ac24c07cab061d8502ab487d8ae7a18c0760ba70c5e"
  }
] as const satisfies readonly NarrationAssetWithDigest[];

/** Resolve against the entry document, not the bundled JS chunk or the origin root.
 * Works for a Vite relative deployment and the desktop game://local/index.html entry.
 */
export function getNarrationBaseURL(baseURI: string | URL = document.baseURI): URL {
  return new URL('audio/chapter-bridge-01/', baseURI);
}

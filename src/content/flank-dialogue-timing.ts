/** Authored seconds against the approved full S07 recordings. These constants
 * are story pacing, independent of audio availability, decoding or playback. */
export const FLANK_DIALOGUE_TIMING = {
  admission: [0, 6.4, 14, 18.8], admissionEnd: 27.5,
  reportReady: 5.2, report: [0, 9.4, 18.4, 28, 33.2], reportEnd: 42.5,
  reliefReady: 6.8, medicineReport: 10.9, exitReady: 20.6,
} as const;

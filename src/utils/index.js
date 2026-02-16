export * from './player.js';
export * from './lyric.js';

import * as playerUtils from './player.js';
import * as lyricUtils from './lyric.js';

export default {
    ...playerUtils,
    ...lyricUtils,
};

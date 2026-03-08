export * from './player/index';
export * from './player/lyric-parser.js';
export * from './performance/index';

import playerUtils from './player/index';
import * as lyricUtils from './player/lyric-parser.js';

export default {
    ...playerUtils,
    ...lyricUtils,
};

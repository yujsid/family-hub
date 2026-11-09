// GIF encoding uses gifenc (MIT) by Matt DesLauriers.
// https://github.com/mattdesl/gifenc
import { GIFEncoder, quantize, applyPalette } from "./gifenc.esm.js";

window.FamilyHubGif = { GIFEncoder, quantize, applyPalette };

// Back-compat shim: the original single-track API (Greenridge Run). Newer code uses tracks.js / track-factory.js.
import { TRACKS } from './tracks.js';
export { ROAD_HALF, SHOULDER, BARRIER } from './track-factory.js';

const G = TRACKS[0];
export const SAMPLES = G.SAMPLES;
export const SECTIONS = G.SECTIONS;
export const CHECKPOINTS = G.CHECKPOINTS;
export const nearest = G.nearest;
export const sampleAt = G.sampleAt;
export const headingAt = G.headingAt;
export const FEATURES = G.FEATURES;
export const sample = G.sample;
export const heightAt = G.heightAt;
export const surfaceAt = G.surfaceAt;
export const constrain = G.constrain;
export const OBSTACLES = G.OBSTACLES;
export const sceneryLayout = G.sceneryLayout;
export const barrierLayout = G.barrierLayout;
export const START_S = G.START_S;
export const startPose = G.startPose;
export const gridPose = G.gridPose;
export const TRACK = G.TRACK;
export const terrain = G.terrain;
export const LENGTH = G.LENGTH;
export const DS = G.DS;
export const featureHeightAt = G.featureHeightAt;

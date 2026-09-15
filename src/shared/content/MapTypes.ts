import type { Point } from '../../game/combat/Ballistics';
import type { RasterMask } from './CollisionWorld';
export interface Terrain { x: number; y: number; width: number; height: number }
export interface Waypoint extends Point { links: number[] }
export interface MapGeometry {
  width: number; height?: number; killY?: number;
  terrain: Terrain[];
  /** Open stair treads support movement from above without blocking the corridor below. */
  stairTreads?: Terrain[];
  /** Coarse structural rectangles for radar when collision uses row runs. */
  minimapTerrain?: Terrain[]; collisionMask?: RasterMask; navigation: Waypoint[];
  spawns: [Point[], Point[]]; objective: Point;
  /** Team 1 and team 2 delivery bases, in world coordinates. */
  deliveryBases?: [Point, Point];
  /** Separate scoring zones; defaults to the briefcase bases on legacy maps. */
  deliveryZones?: [Point, Point];
  palette: { sky: number; wall: number; trim: number };
  artwork?: { id: string; x: number; y: number; width: number; height: number };
}

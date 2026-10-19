import { wallBetween } from '../systems/CollisionSystem';
import type { Rect } from '../systems/LevelGen';

/**
 * 「被这盏灯照到」的完整判定（v95）。
 *
 * v94 让画面里的光停在墙面上，可玩法里还有几处只问"直线距离在灯火半径内"：
 * 无光者隔着墙照样能挨打、微尘还会在墙影里发亮。视觉与规则一旦分成两张地图，
 * 玩家看到的黑暗就不再是黑暗。
 *
 * 这里只做一件事：**半径之内，且中间没有墙**。半径先判，墙的线段判定只留给真正在光里的点；
 * 光源与目标重合时 `wallBetween` 会原样返回"没挡着"，贴脸的目标照旧算被照亮。
 */
export function isLitAt(
  lightX: number,
  lightY: number,
  radius: number,
  x: number,
  y: number,
  walls: readonly Rect[] = [],
): boolean {
  const dx = x - lightX;
  const dy = y - lightY;
  if (dx * dx + dy * dy > radius * radius) return false;
  return !wallBetween(lightX, lightY, x, y, walls);
}

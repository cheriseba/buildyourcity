const CameraGeometry = {
  area(view) {
    return { width: view.w, height: Math.max(1, view.h - view.insetTop - view.insetBottom) };
  },

  center(camera, view) {
    const area = this.area(view);
    return {
      x: camera.x + area.width / (2 * camera.scale),
      y: camera.y + (view.insetTop + area.height / 2) / camera.scale,
    };
  },

  moveCenter(camera, view, center) {
    const area = this.area(view);
    camera.x = center.x - area.width / (2 * camera.scale);
    camera.y = center.y - (view.insetTop + area.height / 2) / camera.scale;
  },

  fitScale(bounds, view) {
    const area = this.area(view);
    return Math.max(area.width / (bounds.maxX - bounds.minX), area.height / (bounds.maxY - bounds.minY));
  },

  fit(camera, bounds, view) {
    camera.scale = this.fitScale(bounds, view);
    this.moveCenter(camera, view, { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
  },

  clamp(camera, view, bounds, regions) {
    const center = this.center(camera, view);
    camera.scale = Math.min(Math.max(4, view.minScale), Math.max(view.minScale, camera.scale));
    const area = this.area(view);
    const halfW = area.width / (2 * camera.scale);
    const halfH = area.height / (2 * camera.scale);
    const clampAxis = (value, min, max, half) => max - min <= half * 2
      ? (min + max) / 2 : Math.max(min + half, Math.min(max - half, value));
    center.x = clampAxis(center.x, bounds.minX, bounds.maxX, halfW);
    center.y = clampAxis(center.y, bounds.minY, bounds.maxY, halfH);

    // Auch bei L-foermigen Staedten muss ein Stueck freigeschaltetes Land im Bild bleiben.
    const marginX = Math.max(0, halfW - Math.min(64, halfW));
    const marginY = Math.max(0, halfH - Math.min(64, halfH));
    let nearest = null;
    let distance = Infinity;
    for (const rect of regions) {
      const x = Math.max(rect.minX - marginX, Math.min(rect.maxX + marginX, center.x));
      const y = Math.max(rect.minY - marginY, Math.min(rect.maxY + marginY, center.y));
      const d = (x - center.x) ** 2 + (y - center.y) ** 2;
      if (d < distance) {
        nearest = { x, y };
        distance = d;
      }
    }
    this.moveCenter(camera, view, nearest || center);
  },
};

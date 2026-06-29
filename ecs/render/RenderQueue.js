export class RenderQueue {
  constructor() {
    this._commands = [];
    this._count = 0;
  }

  get count() {
    return this._count;
  }

  clear() {
    this._count = 0;
  }

  push(image, x, y, rotation, scaleX, scaleY, width, height, fillColor, shape, layer) {
    let cmd = this._commands[this._count];
    if (!cmd) {
      cmd = { image: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 0, height: 0, fillColor: 0, shape: 0, layer: 0 };
      this._commands[this._count] = cmd;
    }
    cmd.image = image;
    cmd.x = x;
    cmd.y = y;
    cmd.rotation = rotation;
    cmd.scaleX = scaleX;
    cmd.scaleY = scaleY;
    cmd.width = width;
    cmd.height = height;
    cmd.fillColor = fillColor;
    cmd.shape = shape;
    cmd.layer = layer;
    this._count++;
  }

  execute(ctx, camera) {
    ctx.save();
    if (camera) camera.apply(ctx);
    for (let i = 0; i < this._count; i++) {
      const cmd = this._commands[i];
      ctx.save();
      ctx.translate(cmd.x, cmd.y);
      ctx.rotate(cmd.rotation);
      ctx.scale(cmd.scaleX, cmd.scaleY);
      if (cmd.image) {
        ctx.drawImage(cmd.image, -cmd.width / 2, -cmd.height / 2, cmd.width, cmd.height);
      } else {
        const hw = cmd.width / 2;
        const hh = cmd.height / 2;
        ctx.fillStyle = "#" + cmd.fillColor.toString(16).padStart(6, "0");
        if (cmd.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, Math.min(hw, hh), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-hw, -hh, cmd.width, cmd.height);
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

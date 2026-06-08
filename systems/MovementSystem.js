export class MovementSystem {
  update(entities, dt) {
    for (const entity of entities) {
      this.updateOne(entity, dt);
    }
  }

  updateOne(entity, dt) {
    if (!entity.velocity) return;
    entity.transform.x += entity.velocity.x * dt;
    entity.transform.y += entity.velocity.y * dt;
  }
}

export const movementSystem = new MovementSystem();

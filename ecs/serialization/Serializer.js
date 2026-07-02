const VERSION = 1;

export class Serializer {
  static serialize(world) {
    const entities = [];
    const archSystem = world._archetypeSystem;
    const registry = world._registry;

    for (let aid = 1; aid <= archSystem.archetypeCount; aid++) {
      const arch = archSystem.getArchetypeById(aid);
      if (!arch) continue;

      const table = arch.table;
      const signature = arch.signature;
      const ids = table.entityIds;
      const compIds = signature.components;

      for (let r = 0; r < table.count; r++) {
        const entity = ids[r];
        const comps = [];
        const tags = [];

        for (let ci = 0; ci < compIds.length; ci++) {
          const cid = compIds[ci];
          const meta = registry.getMetadataById(cid);
          if (!meta) continue;

          const schema = meta.schema;
          const fieldNames = Object.keys(schema);

          if (fieldNames.length === 0) {
            tags.push(meta.name);
          } else {
            const data = {};
            for (let fi = 0; fi < fieldNames.length; fi++) {
              const fn = fieldNames[fi];
              const col = table.getColumn(cid, fn);
              data[fn] = col[r];
            }
            comps.push({ name: meta.name, data });
          }
        }

        const entry = { id: entity };

        if (comps.length > 0) {
          comps.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
          entry.components = comps;
        }

        if (tags.length > 0) {
          tags.sort();
          entry.tags = tags;
        }

        entities.push(entry);
      }
    }

    entities.sort((a, b) => a.id - b.id);

    return JSON.stringify({ version: VERSION, entities });
  }

  static deserialize(world, json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      throw new Error(`Serializer.deserialize failed: invalid JSON — ${e.message}`);
    }

    if (typeof data !== "object" || data === null || !Array.isArray(data.entities)) {
      throw new Error(
        "Serializer.deserialize failed: invalid format — expected { version, entities }."
      );
    }

    if (data.version !== VERSION) {
      throw new Error(
        `Serializer.deserialize failed: unsupported version ${data.version}. ` +
        `Expected version ${VERSION}.`
      );
    }

    const registry = world._registry;
    const idMap = new Map();
    const parentEntities = [];

    for (let ei = 0; ei < data.entities.length; ei++) {
      const entry = data.entities[ei];
      const oldId = entry.id;

      if (typeof oldId !== "number" || oldId < 1) {
        throw new Error(
          `Serializer.deserialize failed: invalid entity id at index ${ei}.`
        );
      }

      const entity = world.createEntity();
      idMap.set(oldId, entity);

      const comps = entry.components || [];
      const tags = entry.tags || [];

      if (comps.length === 0 && tags.length === 0) continue;

      const allNames = [];
      if (comps.length > 0) {
        for (let ci = 0; ci < comps.length; ci++) {
          allNames.push(comps[ci].name);
        }
      }
      for (let ti = 0; ti < tags.length; ti++) {
        allNames.push(tags[ti]);
      }

      const components = [];
      for (let ni = 0; ni < allNames.length; ni++) {
        const name = allNames[ni];
        const id = registry.getId(name);
        if (id === null) {
          throw new Error(
            `Serializer.deserialize failed: component "${name}" is not registered.`
          );
        }
        const cls = registry.getMetadataById(id).component;
        if (!cls) {
          throw new Error(
            `Serializer.deserialize failed: component "${name}" has no class reference.`
          );
        }
        components.push(cls);
      }

      for (let ci = 0; ci < components.length; ci++) {
        world.addComponent(entity, components[ci]);
      }

      for (let ci = 0; ci < comps.length; ci++) {
        const name = comps[ci].name;
        const data = comps[ci].data;
        const clsIndex = allNames.indexOf(name);
        if (clsIndex === -1) continue;
        const cls = components[clsIndex];
        world.set(entity, cls, data);
        if (name === "Parent") {
          parentEntities.push(entity);
        }
      }
    }

    for (let pi = 0; pi < parentEntities.length; pi++) {
      const entity = parentEntities[pi];
      const pv = world.get(entity, "Parent");
      if (pv && idMap.has(pv.entity)) {
        pv.entity = idMap.get(pv.entity);
      }
    }

    return idMap;
  }
}

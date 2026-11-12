import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesVehicle, type VehicleProfile } from "../lib/vehicle-profile";

const corolla: VehicleProfile = { brand: "Toyota", model: "Corolla", year: 2020, color: "rojo", type: "carro", nickname: "El Rojito" };
const jeep: VehicleProfile = { brand: "Jeep", model: "Wrangler", year: 2021, color: "negro", type: "jeepeta", nickname: "La Jeepeta de María" };
const v = { name: "Equipo 1", plate: "A123456" };

test("finds a vehicle by nickname, color, make, model, type or plate", () => {
  assert.ok(matchesVehicle("rojito", v, corolla));
  assert.ok(matchesVehicle("jeepeta de maria", v, jeep));
  assert.ok(matchesVehicle("el carro rojo", v, corolla));
  assert.ok(matchesVehicle("red", v, corolla));
  assert.ok(matchesVehicle("toyota", v, corolla));
  assert.ok(matchesVehicle("Corolla 2020", v, corolla));
  assert.ok(matchesVehicle("negra", v, jeep));
  assert.ok(matchesVehicle("a123", v, undefined));
});

test("does not match other vehicles", () => {
  assert.ok(!matchesVehicle("rojo", v, jeep));
  assert.ok(!matchesVehicle("toyota", v, jeep));
  assert.ok(!matchesVehicle("jeepeta roja", v, jeep));
  assert.ok(!matchesVehicle("rojo", v, undefined));
});

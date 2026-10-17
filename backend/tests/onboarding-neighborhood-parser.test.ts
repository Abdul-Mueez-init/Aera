import { describe, expect, it } from "vitest";
import { parseGoogleNeighborhoodPlace } from "../src/modules/companies/onboarding.routes.js";

describe("parseGoogleNeighborhoodPlace", () => {
  it("keeps a real named neighborhood with stable ID and coordinates", () => {
    expect(
      parseGoogleNeighborhoodPlace({
        id: "places/neighborhood-1",
        displayName: { text: "North End" },
        location: { latitude: 42.36, longitude: -71.05 },
        types: ["neighborhood", "political"],
      }),
    ).toEqual({
      placeId: "places/neighborhood-1",
      name: "North End",
      latitude: 42.36,
      longitude: -71.05,
    });
  });

  it("does not mistake a business or unrelated place for a service-zone neighborhood", () => {
    expect(
      parseGoogleNeighborhoodPlace({
        id: "places/shop-1",
        displayName: { text: "Heating Supply" },
        location: { latitude: 42.36, longitude: -71.05 },
        types: ["hardware_store", "store"],
      }),
    ).toBeNull();
  });

  it.each([
    null,
    {},
    {
      id: "places/no-coordinate",
      displayName: { text: "North End" },
      types: ["neighborhood"],
    },
    {
      id: "places/out-of-range",
      displayName: { text: "North End" },
      location: { latitude: 120, longitude: -71.05 },
      types: ["neighborhood"],
    },
    {
      id: "places/blank-name",
      displayName: { text: "   " },
      location: { latitude: 42.36, longitude: -71.05 },
      types: ["neighborhood"],
    },
  ])("rejects malformed neighborhood records (%#)", (place) => {
    expect(parseGoogleNeighborhoodPlace(place)).toBeNull();
  });
});

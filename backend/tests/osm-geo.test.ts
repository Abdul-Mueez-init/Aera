import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseOverpassElements,
  reverseGeocode,
  forwardGeocode,
  locateCustomArea,
} from "../src/modules/companies/osm-geo.service.js";
import { AppError } from "../src/common/errors.js";

describe("parseOverpassElements", () => {
  it("parses node elements with coordinates", () => {
    const elements = [
      {
        type: "node",
        id: 123,
        lat: 42.36,
        lon: -71.05,
        tags: { name: "North End" },
      },
    ];
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      5,
    );
    expect(result).toEqual([
      {
        placeId: "osm:node:123",
        name: "North End",
        latitude: 42.36,
        longitude: -71.05,
      },
    ]);
  });

  it("parses way/relation elements with center coordinates", () => {
    const elements = [
      {
        type: "way",
        id: 456,
        center: { lat: 42.37, lon: -71.06 },
        tags: { name: "South End" },
      },
    ];
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      5,
    );
    expect(result).toEqual([
      {
        placeId: "osm:way:456",
        name: "South End",
        latitude: 42.37,
        longitude: -71.06,
      },
    ]);
  });

  it("drops elements without name", () => {
    const elements = [
      {
        type: "node",
        id: 123,
        lat: 42.36,
        lon: -71.05,
        tags: {},
      },
    ];
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      5,
    );
    expect(result).toEqual([]);
  });

  it("drops elements beyond radius", () => {
    const elements = [
      {
        type: "node",
        id: 123,
        lat: 50.0,
        lon: -100.0,
        tags: { name: "Far Away" },
      },
    ];
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      5,
    );
    expect(result).toEqual([]);
  });

  it("drops elements with invalid coordinates", () => {
    const elements = [
      {
        type: "node",
        id: 123,
        lat: 120,
        lon: -71.05,
        tags: { name: "Invalid" },
      },
    ];
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      5,
    );
    expect(result).toEqual([]);
  });

  it("de-duplicates by name, keeping nearest", () => {
    const elements = [
      {
        type: "node",
        id: 123,
        lat: 42.36,
        lon: -71.05,
        tags: { name: "Downtown" },
      },
      {
        type: "node",
        id: 124,
        lat: 42.37,
        lon: -71.06,
        tags: { name: "Downtown" },
      },
    ];
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      5,
    );
    expect(result).toHaveLength(1);
    expect(result[0].placeId).toBe("osm:node:123");
  });

  it("caps results at 20", () => {
    const elements = Array.from({ length: 25 }, (_, i) => ({
      type: "node" as const,
      id: i,
      lat: 42.36 + i * 0.001,
      lon: -71.05 + i * 0.001,
      tags: { name: `Area ${i}` },
    }));
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      50,
    );
    expect(result).toHaveLength(20);
  });

  it("handles malformed elements gracefully", () => {
    const elements = [null, {}, "string", { type: "node" }];
    const result = parseOverpassElements(
      elements,
      { lat: 42.36, lng: -71.05 },
      5,
    );
    expect(result).toEqual([]);
  });
});

describe("reverseGeocode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns address on success", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ display_name: "123 Main St, Boston, MA" }),
    });

    const address = await reverseGeocode(42.36, -71.05);
    expect(address).toBe("123 Main St, Boston, MA");
  });
});

describe("forwardGeocode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns coordinates on success", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: "42.36",
          lon: "-71.05",
          display_name: "123 Main St, Boston, MA",
        },
      ],
    });

    const result = await forwardGeocode("Test Address 1");
    expect(result).toEqual({
      address: "123 Main St, Boston, MA",
      latitude: 42.36,
      longitude: -71.05,
    });
  });
});

describe("locateCustomArea", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns coordinates if found within radius", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: "42.37",
          lon: "-71.06",
        },
      ],
    });

    const result = await locateCustomArea("Custom Area 1", 42.36, -71.05, 5);
    expect(result).toEqual({
      latitude: 42.37,
      longitude: -71.06,
    });
  });

  it("falls back to headquarters on failure", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await locateCustomArea("Custom Area 2", 42.36, -71.05, 5);
    expect(result).toEqual({
      latitude: 42.36,
      longitude: -71.05,
    });
  });

  it("falls back to headquarters if outside radius", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: "50.0",
          lon: "-100.0",
        },
      ],
    });

    const result = await locateCustomArea("Custom Area 3", 42.36, -71.05, 5);
    expect(result).toEqual({
      latitude: 42.36,
      longitude: -71.05,
    });
  });
});

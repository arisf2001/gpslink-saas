#!/usr/bin/env python3
# Builds the gpslink_places.place_area table (outlines of schools, parks, malls, parkings...) from OpenStreetMap .pbf files.
# Usage: python3 scripts/import-places.py out.sql file1.osm.pbf [file2.osm.pbf ...]   then: mysql < out.sql
import sys
import osmium

KINDS = {
    "amenity": {"school": "school", "kindergarten": "school", "university": "university", "college": "college", "hospital": "hospital", "clinic": "clinic",
                "restaurant": "restaurant", "fast_food": "fast_food", "cafe": "cafe", "bar": "bar", "parking": "parking", "fuel": "fuel", "marketplace": "marketplace",
                "place_of_worship": "place_of_worship", "police": "police", "fire_station": "fire_station", "bank": "bank", "townhall": "townhall",
                "bus_station": "bus_station", "grave_yard": "cemetery", "community_centre": "community_centre", "pharmacy": "pharmacy"},
    "leisure": {"park": "park", "stadium": "stadium", "sports_centre": "sports_centre", "playground": "playground", "pitch": "pitch", "golf_course": "golf_course",
                "marina": "marina", "water_park": "water_park"},
    "shop": {"mall": "mall", "supermarket": "supermarket", "department_store": "department_store", "car": "car", "hardware": "hardware", "car_repair": "car_repair"},
    "tourism": {"hotel": "hotel", "attraction": "attraction", "zoo": "zoo", "theme_park": "theme_park", "museum": "museum"},
    "aeroway": {"aerodrome": "aerodrome"},
    "landuse": {"retail": "retail", "cemetery": "cemetery"},
}
wkt = osmium.geom.WKTFactory()


def esc(s):
    return s.replace("\\", "\\\\").replace("'", "''")


class Areas(osmium.SimpleHandler):
    def __init__(self, out):
        super().__init__()
        self.out = out
        self.count = 0
        self.rows = []

    def area(self, a):
        kind = None
        for key, values in KINDS.items():
            kind = values.get(a.tags.get(key, ""))
            if kind:
                break
        if not kind:
            return
        name = a.tags.get("name:es") or a.tags.get("name") or ""
        if not name and kind != "parking":
            return
        try:
            geom = wkt.create_multipolygon(a)
        except Exception:
            return
        self.rows.append("('%s',%s,ST_GeomFromText('%s'))" % (kind, "'%s'" % esc(name[:200]) if name else "NULL", geom))
        self.count += 1
        if len(self.rows) >= 500:
            self.flush()

    def flush(self):
        if self.rows:
            self.out.write("INSERT INTO place_area_new (kind,name,geom) VALUES %s;\n" % ",".join(self.rows))
            self.rows = []


with open(sys.argv[1], "w") as out:
    out.write("SET NAMES utf8mb4;\nCREATE DATABASE IF NOT EXISTS gpslink_places;\nUSE gpslink_places;\nDROP TABLE IF EXISTS place_area_new;\n")
    out.write("CREATE TABLE place_area_new (id INT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(32) NOT NULL, name VARCHAR(200) NULL, area DOUBLE NOT NULL DEFAULT 0, geom GEOMETRY NOT NULL, SPATIAL INDEX(geom)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n")
    for path in sys.argv[2:]:
        h = Areas(out)
        h.apply_file(path, locations=True, idx="flex_mem")
        h.flush()
        print(path, h.count, file=sys.stderr)
    out.write("UPDATE place_area_new SET area = ST_Area(geom);\nDROP TABLE IF EXISTS place_area_old;\nCREATE TABLE IF NOT EXISTS place_area LIKE place_area_new;\n")
    out.write("RENAME TABLE place_area TO place_area_old, place_area_new TO place_area;\nDROP TABLE place_area_old;\n")

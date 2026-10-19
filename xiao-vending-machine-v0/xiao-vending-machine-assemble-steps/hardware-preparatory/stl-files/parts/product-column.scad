// Product column for the four-column XIAO dispenser.
// Open this in OpenSCAD (https://openscad.org) to edit the tube.
// The STL next to this file is the same solid.
//
// Sized from the Version Zero reference:
// - column height 260 mm (the 26 cm PVC column)
// - 50 mm outside diameter, to sit on the ~53 mm dispenser body
// - 46 mm inside diameter, so xiao-series.stl (about 42 mm) can pass
// Four copies match the four dispensers held by the tube support.

height = 260;
outer_d = 50;
wall = 2;

$fn = 64;
difference() {
  cylinder(h = height, d = outer_d);
  translate([0, 0, -1])
    cylinder(h = height + 2, d = outer_d - wall * 2);
}

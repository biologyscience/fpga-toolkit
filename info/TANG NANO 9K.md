- Write .v and .cst
- Install driver to **JTAG Interface 0** using [Zadig](https://zadig.akeo.ie/)
- Install [OSS CAD Suite](https://github.com/YosysHQ/oss-cad-suite-build/releases) (build tools)

---

Synthesize
```
yosys -p "synth_gowin -json $SYNTH.json" $SRC.v
```

Place & Route
```
nextpnr-himbaechel --write $PNR.json --device GW1NR-LV9QN88PC6/I5 --json $SYNTH.json --vopt cst=$SRC.cst --vopt family=GW1N-9C
```

Generate bitstream
```
gowin_pack -d GW1N-9C -o $STREAM.fs $PNR.json
```

Upload bitstream
```
openFPGALoader -b tangnano9k $STREAM.fs
```
append `--write-flash` to store it in SPI Flash Memory
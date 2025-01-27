const sdk = require('cue-sdk');
const {GlobalKeyboardListener} = require("node-global-key-listener");
const fs = require("fs");

const kbl = new GlobalKeyboardListener();

let device;
let availableLeds;
let keymap = {};
let kbIndex = 0;

function setupKey(index){
  if(index >= availableLeds.length){
    fs.writeFileSync("keys.json",JSON.stringify(keymap));
    exit(0);
    return;
  }
  availableLeds.forEach((led) => {
    led.r = led.id==availableLeds[index].id?255:0;
    led.g = 0;
    led.b = 0;
    led.a = 255;
  });
  // console.log(availableLeds);
  sdk.CorsairSetLedColors(device,availableLeds);
}

function keyPressed(key){
  console.log(availableLeds[kbIndex]);
    if(key in keymap){
        console.log("Duplicate Detected");
        keymap[key].push(availableLeds[kbIndex].id);
    }else{
        keymap[key]=[availableLeds[kbIndex].id];
    }
    console.log(`Registered ${key} to id ${availableLeds[kbIndex].id}`)
    kbIndex++;
    setupKey(kbIndex);
}

kbl.addListener((e,down)=>{
    if(e.state == "DOWN"){
        keyPressed(e.name);
    }
});

function exit(code = 0) {
  console.log('Exiting.');
  process.exit(code);
}

function getAvailableLeds() {
  const leds = [];
  const { error, data: devices } = sdk.CorsairGetDevices({
    deviceTypeMask: sdk.CorsairDeviceType.CDT_All
  });
  if (error != sdk.CorsairError.CE_Success) {
    return leds;
  }
  for (let di = 0; di < devices.length; ++di) {
    const result = sdk.CorsairGetLedPositions(devices[di].id);
    // console.log(result);
    const ledPositions = result.data;
    leds.push({
      deviceId: devices[di].id,
      leds: ledPositions.map(p => ({ id: p.id, r: 0, g: 0, b: 0, a: 0 }))
    });
  }

  //Just the first device this time. TODO: Deal with multiple devices.
  availableLeds = [...leds[0].leds];
  device = leds[0].deviceId;
}

let mainRunning = false;
function main() {
  if(mainRunning){
    return;
  }
  mainRunning = true;
  getAvailableLeds();
  console.log(availableLeds.slice(70,availableLeds.length));
  if (!availableLeds.length) {
    console.error('No leds found');
    exit(1);
  }
  setupKey(kbIndex);
}

sdk.CorsairConnect(evt => {
  console.log(sdk.CorsairSessionStateToString(evt.data.state));
  if (evt.data.state == sdk.CorsairSessionState.CSS_Connected) {
    main();
  }
});
const sdk = require('cue-sdk');
const { GlobalKeyboardListener } = require("node-global-key-listener");
const fs = require("fs");

const kbl = new GlobalKeyboardListener();
const keymap = JSON.parse(fs.readFileSync("keys_firstmap.json", "ascii"));
const reverseKeymap = {};
const WHITE = { r: 255, g: 255, b: 255, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };
const GREEN = { r: 0, g: 255, b: 0, a: 255 };
const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLACK = {r:0,g:0,b:0,a:255};
const ORANGE = {r:255,g:128,b:0,a:255};

const START_COLOR = BLUE;
const MID_COLOR = WHITE;
const END_COLOR = ORANGE;
const PUNC_START_COLOR = GREEN;
const PUNC_END_COLOR = RED;

let boardLeds;
let numpadLeds;

let leds = {};
let device;
let gameState = {
    state:"textDisplay",
    activeText:[],
    activeTextIndex:0,
    autoAdvance:false,
    nextWordTime:-1
}

for(let key in keymap){
    reverseKeymap[keymap[key][0]] = key;
}

function getAvailableLeds() {
    const availableLeds = [];
    const { error, data: devices } = sdk.CorsairGetDevices({
        deviceTypeMask: sdk.CorsairDeviceType.CDT_Keyboard
    });
    if (error != sdk.CorsairError.CE_Success) {
        console.log("Could not connect");
        return availableLeds;
    }
    if (devices.length == 0) {
        console.log("Error! No keyboard detected.");
    }
    const result = sdk.CorsairGetLedPositions(devices[0].id);
    const ledPositions = result.data;
    device = devices[0].id;
    // console.log("positions",ledPositions);
    for (let i = 0; i < ledPositions.length; i++) {
        leds[ledPositions[i].id] = {
            id: ledPositions[i].id,
            r: 0, g: 0, b: 0, a: 255, x: ledPositions[i].cx, y: ledPositions[i].cy
        };
    }
}

function ledId(keyName) {
    if (!(keyName in keymap)) {
        return -1;
    }
    //Ignore possibility of multiple keys for now.
    return keymap[keyName][0];
}

function setLedColor(keyname, color) {
    let id = ledId(keyname);
    if (id == -1) {
        return false;
    }
    leds[id].r = color.r;
    leds[id].g = color.g;
    leds[id].b = color.b;
    leds[id].a = ("a" in color) ? color.a : 255;
    return true;
}

function setLedColorById(id, color) {
    leds[id].r = color.r;
    leds[id].g = color.g;
    leds[id].b = color.b;
    leds[id].a = ("a" in color) ? color.a : 1;
}

function setLedsInRange(xStart, yStart, xEnd, yEnd, color) {
    for (const id in leds) {
        // console.log(leds[id]);
        if (leds[id].x >= xStart && leds[id].x <= xEnd && leds[id].y >= yStart && leds[id].y <= yEnd) {
            // console.log(id,"in range");
            setLedColorById(id, color);
        }
    }
}

function getLedsInRange(xStart, yStart, xEnd, yEnd) {
    let output = [];
    for (const id in leds) {
        // console.log(leds[id]);
        if (leds[id].x >= xStart && leds[id].x <= xEnd && leds[id].y >= yStart && leds[id].y <= yEnd) {
            // console.log(id,"in range");
            output.push(leds[id]);
        }
    }
    return output;
}

function setLedGroup(group, color) {
    for (let i = 0; i < group.length; i++) {
        if(typeof group[i] == "object"){
            setLedColorById(group[i].id, color);
        }else if(typeof group[i] == "number"){
            setLedColorById(group[i],color);
        }else if(typeof group[i] == "string"){
            setLedColor(group[i],color);
        }
    }
}

function setText(text,auto=false){
    gameState.activeText=text.split(" ");
    gameState.activeTextIndex=0;
    gameState.state="textDisplay";
    gameState.autoAdvance=auto;
    if(auto){
        gameState.nextWordTime=getFramesForWord(gameState.activeText[gameState.activeTextIndex]);
    }
    displayWord();
}

let specialMaps = {
    ".":"DOT",
    "?":"FORWARD SLASH",
    "!":"1",
    ";":"SEMICOLON",
    ":":"SEMICOLON",
    "(":"9",
    ")":"0",
    "\"":"QUOTE",
    "'":"QUOTE",
    "-":"MINUS",
    ",":"COMMA"
}

let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function displayWord(){
    if(gameState.activeText.length==0){
        return;
    }
    let word = gameState.activeText[gameState.activeTextIndex].toUpperCase();
    let hasFirst = false;
    let keyNames = [];
    let colors = [];
    let startLetter=" ";
    for(let i = 0; i < word.length; i++){
        let char = word[i];
        let keyName = (char in specialMaps)?specialMaps[char]:char.toUpperCase();
        if(letters.indexOf(char) != -1){
            if(hasFirst){
                colors.push(keyName==startLetter?START_COLOR:MID_COLOR);
            }else{
                colors.push(START_COLOR);
                startLetter = keyName;
                hasFirst=true;
            }
        }else{
            colors.push(hasFirst?MID_COLOR:PUNC_START_COLOR);
        }
        keyNames.push(keyName);
    }
    for(let i = word.length-1; i >= 0; i--){
        let char = word[i];
        let keyName = (char in specialMaps)?specialMaps[char]:char.toUpperCase();
        if(letters.indexOf(char) != -1){
            colors[i] = (keyName==startLetter)?START_COLOR:END_COLOR;
            break;
        }
        colors[i]=PUNC_END_COLOR;
    }
    for(let i = 0; i  < word.length; i++){
        setLedColor(keyNames[i],colors[i]);
    }
}

function updateLeds() {
    let values = [];
    for (const i in leds) {
        values.push({
            id: leds[i].id,
            r: leds[i].r,
            g: leds[i].g,
            b: leds[i].b,
            a: leds[i].a
        });
    }
    // console.log(device,values);
    sdk.CorsairSetLedColors(device, values);
}

function getFramesForWord(word){
    return word.length*5;
}

kbl.addListener((e,down)=>{
    if(e.state=="DOWN"){
        if(!gameState.autoAdvance){
            if(e.name=="LEFT ARROW"){
                if(gameState.activeTextIndex > 0){
                    gameState.activeTextIndex--;
                }
            }else if(e.name == "RIGHT ARROW"){
                gameState.activeTextIndex++;
                if(gameState.activeTextIndex>=gameState.activeText.length){
                    console.log("Text finished");
                    gameState.activeText=[];
                    gameState.activeTextIndex=0;
                }
            }
        }
    }
})

let mainRunning = false;
function main() {
    if (mainRunning) {
        return;
    }
    mainRunning = true;
    getAvailableLeds();
    let allLeds = Object.values(leds);
    setText("Hello brave adventurer. The goblins are attacking! Here comes one now.",true);
    let loop = setInterval(()=>{
        setLedGroup(allLeds,BLACK)
        displayWord();
        if(gameState.autoAdvance){
            gameState.nextWordTime--;
            if(gameState.nextWordTime<=0){
                gameState.activeTextIndex++;
                if(gameState.activeTextIndex >= gameState.activeText.length){
                    gameState.activeTextIndex=0;
                    gameState.activeText=[];
                }else{
                    gameState.nextWordTime = getFramesForWord(gameState.activeText[gameState.activeTextIndex]);
                }
            }
        }else{
            setLedColor("LEFT ARROW",START_COLOR);
            setLedColor("RIGHT ARROW",END_COLOR);
        }
        updateLeds();
    },33);
}

sdk.CorsairConnect(evt => {
    console.log(sdk.CorsairSessionStateToString(evt.data.state));
    if (evt.data.state == sdk.CorsairSessionState.CSS_Connected) {
        main();
    }
});
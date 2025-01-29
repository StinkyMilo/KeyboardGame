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
const YELLOW = {r:255,g:255,b:0,a:255};
const PURPLE = {r:128,g:0,b:255,a:255};

const START_COLOR = BLUE;
const MID_COLOR = WHITE;
const END_COLOR = ORANGE;
const PUNC_START_COLOR = GREEN;
const PUNC_END_COLOR = RED;
const GOBLIN_SPEED=25;
const SWORD_SPEED=10;

let boardLeds;
let numpadLeds;

let leds = {};
let device;
let gameState = {
    state:"textDisplay",
    activeText:[],
    activeTextIndex:0,
    autoAdvance:false,
    nextWordTime:-1,
    goblins:[],
    swords:[
        {
            position:0,
            timeUntilMove:SWORD_SPEED,
            retreating:false,
        },
        {
            position:0,
            timeUntilMove:SWORD_SPEED,
            retreating:false,
        },
        {
            position:0,
            timeUntilMove:SWORD_SPEED,
            retreating:false,
        },
        {
            position:0,
            timeUntilMove:SWORD_SPEED,
            retreating:false
        }
    ],
    onTextEnd:()=>{}
}

const keyRows = [
    ["SECTION","1","2","3","4","5","6","7","8","9","0","MINUS","EQUALS","BACKSPACE"],
    ["TAB","Q","W","E","R","T","Y","U","I","O","P","SQUARE BRACKET OPEN","SQUARE BRACKET CLOSE","BACKSLASH"],
    ["CAPS LOCK","A","S","D","F","G","H","J","K","L","SEMICOLON","QUOTE","RETURN"],
    ["LEFT SHIFT","Z","X","C","V","B","N","M","COMMA","DOT","FORWARD SLASH","RIGHT SHIFT"]
];

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

function setText(text,auto=false,onTextEnd=()=>{}){
    gameState.activeText=text.split(" ");
    gameState.activeTextIndex=0;
    gameState.state="textDisplay";
    gameState.autoAdvance=auto;
    gameState.onTextEnd=onTextEnd;
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
    if(word[0]=="[" && word[word.length-1] == "]"){
        let key = word.substring(1,word.indexOf(":")).replaceAll("_"," ").toUpperCase();
        let colorList = word.substring(word.indexOf(":")+1,word.indexOf("]")).split(",");
        let color = {r:parseInt(colorList[0]),g:parseInt(colorList[1]),b:parseInt(colorList[2])};
        setLedColor(key,color);
        return;
    }
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
                    gameState.onTextEnd();
                }
            }
        }
        for(let i = 0; i < gameState.swords.length; i++){
            let sword = gameState.swords[i];
            if(sword.retreating){
                continue;
            }
            let key = keyRows[i][sword.position];
            let anyHit = false;
            if(e.name==key){
                sword.position++;
                anyHit=true;
            }else{
                //Allow a skip of one key.
                let nextKey = keyRows[i][sword.position+1];
                if(e.name==nextKey){
                    sword.position+=2;
                    anyHit=true;
                }
            }
            if(anyHit){
                for(let j = gameState.goblins.length-1; j >= 0; j--){
                    let goblin = gameState.goblins[j];
                    let goblinPos = keyRows[goblin.row].length-1-goblin.progress;
                    if(keyRows[goblin.row][goblinPos]==e.name || keyRows[goblin.row][goblinPos+1]==e.name){
                        gameState.goblins.splice(j,1);
                        sword.retreating=true;
                        sword.position=goblinPos-1;
                    }
                }
                break;
            }
        }
    }
})

function newGoblin(){
    gameState.goblins.push({
        row:Math.floor(Math.random()*4),
        progress:0,
        timeUntilMove:GOBLIN_SPEED
    });
}

let mainRunning = false;
function main() {
    if (mainRunning) {
        return;
    }
    mainRunning = true;
    getAvailableLeds();
    let allLeds = Object.values(leds);
    setText("Hello brave adventurer. The goblins are attacking! Here comes one now.",false,()=>{
        gameState.goblins.push({
            row:1,
            progress:0,
            timeUntilMove:GOBLIN_SPEED
        });
        setText("Stop! Whatever you do, don't press ENTER. SLASH the goblin instead. Start here, [CAPS_LOCK:255,0,0] then slide right until you reach the goblin.")
    });
    newGoblin();
    newGoblin();
    let loop = setInterval(()=>{
        setLedGroup(allLeds,BLACK)
        // displayWord();

        //Update text
        if(gameState.autoAdvance){
            gameState.nextWordTime--;
            if(gameState.nextWordTime<=0){
                gameState.activeTextIndex++;
                if(gameState.activeTextIndex >= gameState.activeText.length){
                    gameState.activeTextIndex=0;
                    gameState.activeText=[];
                    gameState.onTextEnd();
                }else{
                    gameState.nextWordTime = getFramesForWord(gameState.activeText[gameState.activeTextIndex]);
                }
            }
        }else{
            setLedColor("LEFT ARROW",START_COLOR);
            setLedColor("RIGHT ARROW",END_COLOR);
        }

        //Update goblins
        for(let i = 0; i < gameState.goblins.length; i++){
            let goblin = gameState.goblins[i];
            let row = keyRows[goblin.row];
            let key = row[row.length-goblin.progress-1];
            goblin.timeUntilMove--;
            if(goblin.timeUntilMove <= 0){
                goblin.progress++;
                goblin.timeUntilMove = GOBLIN_SPEED;
                if(goblin.progress >= row.length){
                    //Game over
                }
            }
            setLedColor(key,GREEN);
        }

        //Update Swords
        for(let i = 0; i < gameState.swords.length; i++){
            let sword = gameState.swords[i];
            setLedColor(keyRows[i][sword.position],sword.position==0?PURPLE:YELLOW);
            sword.timeUntilMove--;
            if(sword.timeUntilMove<=0){
                if(sword.position > 0){
                    sword.retreating=true;
                    sword.position--;
                    if(sword.position==0){
                        sword.retreating=false;
                    }
                }
                sword.timeUntilMove=SWORD_SPEED;
            }
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

/*
    You have swords on each of the rows of keys
    Press each key in order on that row to advance the sword.
    Run the sword up to the goblin to kill the goblin. Then the sword must rest.
    If you accidentally press a key a goblin is on without killing it with a sword, you lose.
    If a goblin makes it to the end of the row, you lose.
*/
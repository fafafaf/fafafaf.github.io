function ticktotime(t) {
	var t= t/10;
	var hours = Math.floor(t / 3600);
	t -= hours * 3600;
	var minutes = Math.floor(t / 60);
	t -= minutes * 60;
	var seconds = parseInt(t % 60, 10);
	return hours + ':' + (minutes < 10 ? '0' + minutes : minutes) + ':' + (seconds < 10 ? '0' + seconds : seconds);
}
function ReplayParser(data) {
	var d = new DataView(data.buffer);
	var idx = 0;
	chat = [];
	
	STITARGET = {
		"NONE": 0,
        "Entity": 1,
        "Position": 2
	}
	ECmdStreamOp = {
        "CMDST_Advance": 0,
        "CMDST_SetCommandSource": 1,
        "CMDST_CommandSourceTerminated": 2,
        "CMDST_VerifyChecksum": 3,
        "CMDST_RequestPause": 4,
        "CMDST_Resume": 5,
        "CMDST_SingleStep": 6,
        "CMDST_CreateUnit": 7,
        "CMDST_CreateProp": 8,
        "CMDST_DestroyEntity": 9,
        "CMDST_WarpEntity": 10,
        "CMDST_ProcessInfoPair": 11,
        "CMDST_IssueCommand": 12,
        "CMDST_IssueFactoryCommand": 13,
        "CMDST_IncreaseCommandCount": 14,
        "CMDST_DecreaseCommandCount": 15,
        "CMDST_SetCommandTarget": 16,
        "CMDST_SetCommandType": 17,
        "CMDST_SetCommandCells": 18,
        "CMDST_RemoveCommandFromQueue": 19,
        "CMDST_DebugCommand": 20,
        "CMDST_ExecuteLuaInSim": 21,
        "CMDST_LuaSimCallback": 22,
        "CMDST_EndGame": 23
    }
	
	EUnitCommandType = [
        "NONE",
        "Stop",
        "Move",
        "Dive",
        "FormMove",
        "BuildSiloTactical",
        "BuildSiloNuke",
        "BuildFactory",
        "BuildMobile",
        "BuildAssist",
        "Attack",
        "FormAttack",
        "Nuke",
        "Tactical",
        "Teleport",
        "Guard",
        "Patrol",
        "Ferry",
        "FormPatrol",
        "Reclaim",
        "Repair",
        "Capture",
        "TransportLoadUnits",
        "TransportReverseLoadUnits",
        "TransportUnloadUnits",
        "TransportUnloadSpecificUnits",
        "DetachFromTransport",
        "Upgrade",
        "Script",
        "AssistCommander",
        "KillSelf",
        "DestroySelf",
        "Sacrifice",
        "Pause",
        "OverCharge",
        "AggressiveMove",
        "FormAggressiveMove",
        "AssistMove",
        "SpecialAction",
        "Dock"
    ]
	
	function readUInt32() {
		tmp = d.getUint32(idx,true);
		idx +=4;
		return tmp;
	}	
	function readInt32() {
		tmp = d.getInt32(idx,true);
		idx +=4;
		return tmp;
	}
	function readUInt16() {
		tmp = d.getUint16(idx,true);
		idx +=2;
		return tmp;
	}
	function readString() {
		var tmp = [];
		while(1) {
			c = d.getUint8(idx++);
			if (c==0)
				break;
			else
				tmp.push(c);
		}
		return decodeURIComponent(escape(String.fromCharCode.apply(null, tmp)));
	}
	
	function skipBytes(num) {
		idx += num;
	}
	
	function readUInt8() {
		return d.getUint8(idx++);
	}
	
	function readFloat() {
		tmp = d.getFloat32(idx,true);
		idx +=4;
		return tmp;
	}
	
	function parseLua() {
		type = readUInt8();
		switch(type) {
			case 0: // lua num
				return readFloat();
			case 1: // string
				return readString();
			case 2: // nil
				skipBytes(1);
				return null;
			case 3: // bool
				return (readUInt8() == 0?true:false);
			case 4: // lua
				var res = [];
				while(readUInt8() != 5) {
					idx--;
					var k = parseLua();
					var v = parseLua();
					res[k] = v;
				}
				return res;
			default:
				console.log("Hibas a lua parser");
		}
	}
	
	function parseHeader() {
		verstring = readString();
		skipBytes(3)
		map = readString();
		skipBytes(4)

		modsSize = readUInt32();
		mods = parseLua();
		
		scenarioSize = readUInt32();
		scenario = parseLua();
		
		numOfSources = readUInt8();
		timeoutsRem = []
		for(i = 0; i<numOfSources;i++) {
			name = readString();
			num = readUInt32();
			timeoutsRem[name] = num;
		}
		
		cheats = readUInt8();
		numOfArmies = readUInt8();
		
		army = [];
		cmds = [];
		for(i = 0; i< numOfArmies; i++) {
			playerDataSize = readUInt32();
			playerData = parseLua();
			playerSource = readUInt8();
			
			army[playerSource] = playerData;
			army[playerSource]["commands"] = [];
			
			if(playerSource != 255) {
				skipBytes(1);
				cmds[playerSource] = [];
			}
		}
		
		randomSeed = readUInt32();
		
		ticks = 0;
	}
	
	function parseTicks() {
		var tick = 0;
		var player = -1;
		
		lasttick = {}

		while(idx < d.byteLength) {
			message_op = readUInt8();
			message_len = readUInt16();
			
			switch(message_op) {
				case ECmdStreamOp.CMDST_Advance:
					tick += readUInt32();
					break;
				case ECmdStreamOp.CMDST_SetCommandSource:
					player = readUInt8();
					break;
				case ECmdStreamOp.CMDST_LuaSimCallback:
					luaName = readString();
					lua = parseLua();
					
					if (luaName == "GiveResourcesToPlayer")
						if ("Msg" in lua)
							if (lua["From"] -1 != -2) {
								if (army[lua["From"]-1] && army[lua["From"]-1]["PlayerName"] == lua["Sender"]) {
									if(lua["Msg"]["to"] == "allies")
										chat.push("[" + ticktotime(tick) + "] <b>" + lua["Sender"] + "</b> to " + lua["Msg"]["to"] + ": <font color=\"tomato\">" + lua["Msg"]["text"] + "</font>");
									else
										chat.push("[" + ticktotime(tick) + "] <b>" + lua["Sender"] + "</b> to " + lua["Msg"]["to"] + ": " + lua["Msg"]["text"]);
								}
								else if(army[lua["Msg"]["to"] - 1] && "from" in lua["Msg"]) 
									chat.push("[" + ticktotime(tick) + "] <b>" + lua["Msg"]["from"] + "</b> to <b>" + army[lua["Msg"]["to"] - 1]["PlayerName"] + "</b>: <font color=\"yellow\">" + lua["Msg"]["text"] + "</font>");
							}
					
					
					if(lua) {
						x = readUInt32();
						skipBytes(4*x);
					}
					else
						skipBytes(4 + 3);
					break;
				case ECmdStreamOp.CMDST_CommandSourceTerminated:
					lasttick[player] = tick;
					break;
				case ECmdStreamOp.CMDST_IssueCommand:
				case ECmdStreamOp.CMDST_IssueFactoryCommand:					
					
					cmds[player][tick] = cmds[player][tick] + 1 || 1
					
					unitNums = readUInt32();
					skipBytes(unitNums * 4)
					
					cmdId = readUInt32();
					skipBytes(4);
					commandType = readUInt8();
					skipBytes(4);
					stitarget = readUInt8();
					
					switch(stitarget){
						case STITARGET.NONE:
							break;
						case STITARGET.Entity:
							entity = readUInt32();
							break;
						case STITARGET.Position:
							x = readFloat();
							y = readFloat();
							z = readFloat();
							break;
						default:
					}
					
					skipBytes(1);
					formation = readInt32();
					if (formation != -1) {
						w = readFloat();						
						x = readFloat();
						y = readFloat();
						z = readFloat();
						scale = readFloat();
					}
					
					bp = readString();
					skipBytes(4 + 4 + 4);
					upgradeLua = parseLua();
					if (upgradeLua)
						skipBytes(1)
					
					army[player]["commands"].push({tick: tick, type: commandType, bp: bp, lua: upgradeLua});
					break;
				default:
					skipBytes(message_len - 3);
			}
			
		}
		ticks = tick;
	}
	if(data.length>0) {
		parseHeader();
		parseTicks();
	} else {
		throw "Broken replay (no data)";
	}
  }
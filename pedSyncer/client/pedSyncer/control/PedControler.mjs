import native from 'natives';
import * as alt from 'alt';
import { Ped } from '../class/PedClass.mjs';
import { inDistanceBetweenPos } from '../utils/functions.mjs';

var pedType = 1654;

export function startPedControler() {
    //Event which fires if syncedMeta of a ped has been deleted
    alt.onServer('pedSyncer:server:metaDelete', (pedId, key) => {
        Ped.getByID(pedId).syncedMetaData[key] = undefined;

        delete Ped.getByID(pedId).syncedMetaData[key];
    });

    //Event which fires if syncedMeta of a ped has been changed
    alt.onServer('pedSyncer:server:metaSet', (pedId, key, value) => {
        Ped.getByID(pedId).syncedMetaData[key] = value;
    });

    //Event which fires if a ped was created on server-side or on connect of this player
    alt.onServer('pedSyncer:server:create', (newPed) => {
        if (typeof Ped.getByID(newPed.id) !== "undefined") return;

        let ped = new Ped(newPed);
    });

    //Event which fires if a ped was deleted
    //Currently inactive
    alt.onServer('pedSyncer:server:delete', (ped) => {

    });

    alt.onServer("entitySync:netOwner", (entityId, entityType, isNetOwner) => {
        if (entityType != pedType) return;

        if (isNetOwner) setNetOwner(entityId, 0, 100);
        else {
            let ped = Ped.getByID(entityId);
    
            if (typeof ped !== "undefined") ped.releaseNetOwner();
        }
    });

    //Event which fires if the properties of a ped has been changed
    alt.onServer('pedSyncer:server:update', (ped) => {
        let ped = Ped.getByID(ped.id);

        if (typeof ped !== "undefined") ped.updateProperties(ped);
    });

    //Event which fires if the position was changed
    alt.onServer("entitySync:updatePosition", (entityId, entityType, position) => {
        if (entityType != pedType) return;

        let ped = Ped.getByID(entityId);

        if (typeof ped !== "undefined") {
            ped.pos = position;
            if (ped.scriptID != 0 && !inDistanceBetweenPos(ped.pos, position, 2)) native.setEntityCoords2(ped.scriptID, position.x, position.y, position.z, 1, 0, 0, 1);
        }
    });

    //Event which fires on ped get streamed in
    alt.onServer("entitySync:create", (entityId, entityType, position, newEntityData) => {
        if (entityType != pedType) return;

        let ped = Ped.getByID(entityId);

        if (typeof ped !== "undefined" && ped.vehicle != null && ped.vehicle != "") return;

        trySpawn(entityId, position, 0, 100, newEntityData);
    });

    //TrySpawn Mechanik to make sure that the peds data is complete and then spawn it surely
    function trySpawn(entityId, position, spawnTrys, spawnTrysTime, newEntityData = null) {
        if (spawnTrys >= 10) return;

        let ped = Ped.getByID(entityId);
        
        if (typeof ped !== "undefined" && ped.vehicle != null && ped.vehicle != "") return;

        if (typeof ped === "undefined") {
            alt.setTimeout(() => {
                trySpawn(entityId, position, spawnTrys+1, spawnTrysTime*2, newEntityData);
            }, spawnTrysTime);
        } else {
            ped.pos = position;
            ped.spawn();

            if (newEntityData) setPedProperties(entityId, newEntityData);
        }
    }

    //Event which fires on ped get streamed out
    alt.onServer("entitySync:remove", (entityId, entityType) => {
        if (entityType != pedType) return;

        let ped = Ped.getByID(entityId);

        if (typeof ped === "undefined" || ped.vehicle != null) return;

        ped.outOfRange();
    });

    //Event which fires on peds data update
    alt.onServer("entitySync:updateData", (entityId, entityType, newEntityData) => {
        if (entityType != pedType) return;

        //If we are not the netOwner: Set all properties generated by the actual netOwner
        setPedProperties(entityId, newEntityData);
    });

    //Function to set all ped properties
    function setPedProperties(entityId, newEntityData) {
        let ped = Ped.getByID(entityId);

        //If ped is not set: Stop updating the ped properties
        if (typeof ped === "undefined") return;

        for (let key in newEntityData) {
            if (ped[key] != newEntityData[key]) {
                ped[key] = newEntityData[key];

                switch (key) {
                    case 'heading':
                        //native.setEntityHeading(ped.scriptID, ped[key]);
                        break;
                    case 'model':
                        //TODO ???
                        break;
                    case key.match(/drawable/):
                    case key.match(/texture/):
                    case key.match(/prop/):
                        ped.setPedComponentVariation();
                        break;
                    case 'invincible':
                        native.setEntityInvincible(ped.scriptID, ped[key]);
                        break;
                    case 'hasBlood':
                        if (ped[key]) native.clearPedBloodDamage(ped.scriptID);
                        //TODO: else
                        break;
                    case 'armour':
                        native.setPedArmour(ped.scriptID, ped[key]);
                        break;
                    case 'health':
                        native.setEntityHealth(ped.scriptID, ped[key], 0);
                        break;
                    case 'dead':
                        if (ped[key]) native.setPedToRagdoll(ped.scriptID, -1, -1, 0, false, false, false);
                        break;
                    case 'freeze':
                        native.freezeEntityPosition(ped.scriptID, ped[key]);
                        break;
                    /*case 'flags':
                        for (let flag in newEntityData[key]) {
                            native.setPedConfigFlag(ped.scriptID, flag, newEntityData[key][flag]);
                        }
                        break;*/
                }
            }
        }
    }

    //Function to set us as the new netOwner
    function setNetOwner(entityId, setTrys, setTrysTime) {
        if (setTrys >= 10) return;

        let ped = Ped.getByID(entityId);

        if (typeof ped === "undefined") {
            alt.setTimeout(() => {
                setNetOwner(entityId, setTrys+1, setTrysTime*2);
            }, setTrysTime);
        } else ped.becomeNetOwner();
    }

    let streamedInVehicle = [];
    function checkStreamedInVehicle() {
        try {
            let newStreamedInVehicle = [];

            for (let vehicle of alt.Vehicle.all) {
                if (
                    vehicle.scriptID != 0 && 
                    vehicle.hasSyncedMeta("ped")
                ) {
                    newStreamedInVehicle.push(vehicle.id);
                    
                    if (streamedInVehicle.indexOf(vehicle.id) == -1) trySpawn(parseInt(vehicle.getSyncedMeta("ped")), vehicle.pos, 0, 100);
                }
            }

            for (let vehicleId of streamedInVehicle.filter(vehicleIdCheck => newStreamedInVehicle.indexOf(vehicleIdCheck) == -1)) {
                let vehicle = getVehicleById(vehicleId);

                if (
                    typeof vehicle !== "undefined" &&
                    vehicle.hasSyncedMeta("ped")
                ) {
                    let ped = Ped.getByID(parseInt(vehicle.getSyncedMeta("ped")));

                    if (typeof ped !== "undefined") ped.outOfRange();
                }
            }

            streamedInVehicle = newStreamedInVehicle;
        } catch (error) {
            
        }

        alt.setTimeout(checkStreamedInVehicle, 100);
    }
    alt.setTimeout(checkStreamedInVehicle, 5000);
    
    //Event which fires if a ped has a new path
    alt.onServer('pedSyncer:server:path', (pedId, path) => {
        let ped = Ped.getByID(pedId);

        if (typeof ped !== "undefined") ped.setPath(path);
    });

    //Delete all current peds if the ressource stop (important for development)
    alt.on("resourceStop", () => {
        for (let ped of Ped.getAllStreamedPeds()) native.deletePed(ped.scriptID);
    });

    alt.on("consoleCommand", (name, args) => {
        if (name == "pedDebug") {
            let ped = Ped.getByID(args[0]);
            
            if (typeof ped !== "undefined") {
                let isNetowner = ped.netOwner == alt.Player.local.id;

                alt.log("Ped Debug: " + ped.id + " " + !ped.debug + " " + isNetowner);
                
                ped.debug = !ped.debug;
            }
        }
    });

    alt.setTimeout(() => {alt.emitServer("pedSyncer:client:ready")}, 2000);
}
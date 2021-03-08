const rover = require("./index.js");

const g_trace = false;
const g_traceError = true;

const g_compactJSONOutput = false;

//
// Monitor loop for Renogy Rover MPPT Controller.
//
// Identifies product model, then goes into a loop dumping
// real time and longer term variables at their configured
// intervals.
//
const monitorLoop = async (port, monitor_interval) => {
  console.log("renogy-rover monitor loop");

  const config = {};

  config.trace = g_trace;
  config.traceError = g_traceError;

  config.port = port;

  // use defaults
  //config.baudrate = g_modbusBaudRate;
  //config.modbusID = g_modbusID;
  //config.modbusTimeout = g_modbusTimeout;

  const renogy = new rover.RenogyRover(config);

  const result = await renogy.connect();

  if (result != null) {
    console.log("connect error result=" + result);
    return;
  }

  console.log("connected...");

  const model = await renogy.getProductModel().catch((err) => {
    console.log("error reading model error=" + err);
  });

  console.log("Renogy Model is: ");
  console.log(model);

  if (model.indexOf("ML2420N") != -1) {
    console.log("model ML2420N supported by this application identified");
  } else {
    console.log("Warning Model not tested model=" + model);
  }

  console.log("");

  //
  // Do one pass right away, then on the supplied interval
  //
  const readings = await getReadings(renogy).catch((_) => {});
  if (readings) printReadings(readings);

  setInterval(monitorPass, monitor_interval * 1000, renogy);
};

//
// A monitor pass runs every timeout interval.
//
// callback(error, readings)
//
const monitorPass = async (renogy) => {
  const readings = await getReadings(renogy).catch((err) => {
    console.log("");
    console.log(new Date(Date.now()).toISOString() + ":");
    console.log("error getting readings error=" + err);
  });
  if (readings) printReadings(readings);
};

//
// Get Readings from the Renogy Rover MPPT controller.
//
// callback(error, readings)
//
const getReadings = async (renogy) => {
  const readings = {};

  readings.date = new Date(Date.now());

  readings.panel = null;
  readings.panelError = null;

  readings.battery = null;
  readings.batteryError = null;

  readings.historical = null;
  readings.historicalError = null;

  //
  // Get panel state
  //
  const panelState = await renogy
    .getPanelState()
    .catch((err) => (readings.panelError = err));
  if (panelState) readings.panel = panelState;
  // Get Battery State
  //
  const batteryState = await renogy
    .getBatteryState()
    .catch((err) => (readings.batteryError = err));
  if (batteryState) readings.battery = batteryState;

  //
  // Get historical (long running) parameters
  //
  const historicalParameters = await renogy
    .getHistoricalParameters()
    .catch((err) => (readings.historicalError = err));
  if (historicalParameters) readings.historical = historicalParameters;

  return readings;
};

const printReadings = (readings) => {
  //
  // Only do detailed print when trace is required.
  //

  if (!g_trace) {
    console.dir(readings, { depth: null });
    return;
  }

  console.log("");
  console.log(readings.date.toISOString() + ":");

  if (readings.panelError != null) {
    console.log("error reading panel state error=" + readings.panelError);
  } else {
    console.log("Panel Voltage is: " + readings.panel.voltage);
    console.log("Panel Current is: " + readings.panel.current);
    console.log("Charging power is: " + readings.panel.chargingPower);
  }

  if (readings.batteryError != null) {
    console.log("error reading battery state error=" + readings.batteryError);
  } else {
    console.log("Battery stateOfCharge is: " + readings.battery.stateOfCharge);
    console.log(
      "Battery voltage is: " + convert10thUnits(readings.battery.voltage)
    );
    console.log(
      "Battery chargingCurrent is: " +
        convert100thUnits(readings.battery.chargingCurrent)
    );
    console.log(
      "Battery controllerTemperature is: " +
        readings.battery.controllerTemperature
    );
    console.log(
      "Battery batteryTemperature is: " + readings.battery.batteryTemperature
    );
  }

  if (readings.historicalError != null) {
    console.log(
      "error reading battery state error=" + readings.historicalError
    );
  } else {
    console.log("Historical Parameters=");
    console.log(readings.historical);
  }
};

const convert100thUnits = (value) => value / 100;
const convert10thUnits = (value) => value / 10;

const main = async (count, args) => {
  let port = null;
  let monitor_interval = 60;

  if (process.env.RENOGY_ROVER_INTERVAL != null) {
    monitor_interval = parseInt(process.env.RENOGY_ROVER_INTERVAL);
  }

  if (count == 1) {
    //
    // if no port see if its in the environment.
    //
    if (process.env.RENOGY_ROVER_PORT != null) {
      port = process.env.RENOGY_ROVER_PORT;
    } else {
      usage(
        "must set RENOGY_ROVER_PORT environment variable, or supply as an argument."
      );
      process.exit(1);
    }
  } else if (count == 2) {
    port = args[1];
  } else if (count == 3) {
    port = args[1];
    monitor_interval = args[2];
  } else {
    usage("improper number of arguments " + count);
    process.exit(1);
  }

  console.log("port=" + port, " monitor_interval=" + monitor_interval);

  await monitorLoop(port, monitor_interval);
  return;
};

const usage = (message) => {
  if (message != null) {
    console.error(message);
  }

  console.error("renogyapp port monitor_interval_in_seconds");

  process.exit(1);
};

//
// Remove argv[0] to get to the base of the standard arguments.
// The first argument will now be the script name.
//
const args = process.argv.slice(1);

// Invoke main
main(args.length, args);

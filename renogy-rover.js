const ModbusRTU = require("modbus-serial");

const defaultConfig = {
  trace: false,
  traceError: false,
  baudrate: 9600,
  modbusID: 1,
  modbusTimeout: 1000,
};

class RenogyRover {
  constructor(config) {
    this.config = {
      ...defaultConfig,
      ...config,
    };

    // port is required.
    if (typeof config.trace == "undefined" || config.port == null) {
      throw "serial port is required";
    }

    this.port = this.config.port;
    this.trace = this.config.trace;
    this.traceError = this.config.traceError;
    this.baudrate = this.config.baudrate;
    this.modbusID = this.config.modbusID;
    this.modbusTimeout = this.config.modbusTimeout;

    // client is the modbus client interface for low level modbus transactions.
    this.client = null;
  }
  //
  // Return the modbus client object instance for custom commands.
  //
  getModbusClient() {
    return this.client;
  }
  connect(callback) {
    // create an empty modbus client
    this.client = new ModbusRTU();

    this.client.setTimeout(this.modbusTimeout);
    this.client.setID(this.modbusID);

    //
    // open connection to a serial port
    //
    //
    // Renogy Rover appears to work with the buffered port option.
    // The unbuffered option returns various transfer data length
    // errors, since the modbus-serial expects whole packets, and
    // serial is an inherently async protocol.
    //
    // this.client.connectRTU(this.port, { baudrate: this.baudrate }, callback);
    //
    this.client.connectRTUBuffered(
      this.port,
      { baudRate: this.baudrate },
      callback
    );
  }
  //
  // Get product model string from device.
  //
  // Used to identify device, and that its in fact a Renogy MPPT
  // 20 or 40 amp solar controller.
  //
  // callback(error, data)
  //
  getProductModel(callback) {
    //
    // 0x000C (16) - Product Model.
    //
    const registerBase = 0x000c;
    const registerLength = 16;

    this.readHoldingRegisters(registerBase, registerLength, (err, data) => {
      if (err != null) {
        if (this.trace) console.log("error reading product model error=" + err);

        if (err.message != null && this.trace)
          console.log(
            "error reading product model error.message=" + err.message
          );

        callback(err, null);
        return;
      }

      //
      // Structure of returned data from json dump:
      //
      // data.data[] - array of data
      // data.buffer - node.js buffer type
      //
      //
      // data.buffer is a node.js Buffer type.
      //
      // https://nodejs.org/api/buffer.html
      // https://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end
      //
      //console.log("data=");
      //dumpasjson(data);
      //
      const model = data.buffer.toString("ascii");
      if (this.trace) console.log("model=" + model);

      // Model shows as "     ML2420N"
      callback(null, model);
    });
  }
  //
  // Get panel state.
  //
  // Connected
  // voltage
  // current
  // MPPT point.
  //
  // Returns as object, which can readily be converted to JSON.
  //
  // 0x0107, 0x0108 - solar panel voltage * 0.1
  // 0x
  //
  //
  getPanelState(callback) {
    const panelState = {};
    panelState.voltage = 0.0;
    panelState.current = 0.0;
    panelState.chargingPower = 0.0;

    //
    // 0x0107 (2) - Solar panel voltage  * 0.1
    // 0x0108 (2) - Solar panel current * 0.01
    // 0x0109 (2) - Charging Power actual value
    //
    const registerBase = 0x0107;
    const registerLength = 3;

    this.readHoldingRegisters(registerBase, registerLength, (err, data) => {
      if (err != null) {
        if (this.trace) console.log("error reading panel voltage error=" + err);

        if (err.message != null && this.trace)
          console.log(
            "error reading panel voltage error.message=" + err.message
          );

        callback(err, null);
        return;
      }

      // modbus registers are 16 bit
      panelState.voltage = data.buffer.readInt16BE(0);
      panelState.current = data.buffer.readInt16BE(2);
      panelState.chargingPower = data.buffer.readInt16BE(4);

      callback(null, panelState);
    });
  }
  //
  // Get Battery State.
  //
  getBatteryState(callback) {
    const batteryState = {};
    batteryState.stateOfCharge = 0;
    batteryState.voltage = 0.0;
    batteryState.chargingCurrent = 0.0;
    batteryState.controllerTemperature = 0.0;
    batteryState.batteryTemperature = 0.0;

    //
    // 0x0100 (2) - Battery capacity SOC (state of charge)
    // 0x0101 (2) - Battery voltage * 0.1
    // 0x0102 (2) - Charging current to battery * 0.01
    // 0x0103 (2) - Upper byte controller temperature bit 7 sign, bits 0 - 6 value
    //            - Lower byte battery temperature bit 7 sign, bits 0 - 6 value
    //
    const registerBase = 0x0100;
    const registerLength = 4;

    this.readHoldingRegisters(registerBase, registerLength, (err, data) => {
      if (err != null) {
        if (this.trace) console.log("error reading battery state error=" + err);

        if (err.message != null && this.trace)
          console.log(
            "error reading battery state error.message=" + err.message
          );

        callback(err, null);
        return;
      }

      // modbus registers are 16 bit
      batteryState.stateOfCharge = data.buffer.readInt16BE(0);
      batteryState.voltage = data.buffer.readInt16BE(2);
      batteryState.chargingCurrent = data.buffer.readInt16BE(4);
      batteryState.controllerTemperature = data.buffer.readInt8(6);
      batteryState.batteryTemperature = data.buffer.readInt8(7);

      callback(null, batteryState);
    });
  }
  //
  // Get historical, or slowly changing parameters.
  //
  getHistoricalParameters(callback) {
    const hist = {};

    hist.batteryVoltageMinForDay = 0.0;
    hist.batteryVoltageMaxForDay = 0.0;
    hist.maxChargeCurrentForDay = 0.0;
    hist.maxDischargeCurrentForDay = 0.0;
    hist.maxChargePowerForDay = 0.0;
    hist.maxDischargePowerForDay = 0.0;
    hist.maxChargeAmpHoursForDay = 0.0;
    hist.maxDischargeAmpHoursForDay = 0.0;
    hist.powerConsumptionForDay = 0.0;

    //
    // 0x010B (2) - Battery min voltage of current day * 0.1
    // 0x010C (2) - Battery max voltage of current day * 0.1
    // 0x010D (2) - max charging current of current day * 0.01
    // 0x010E (2) - max discharging current of current day * 0.01
    // 0x010F (2) - max charging power of the current day actual value
    // 0x0110 (2) - max discharging power of the current day actual value
    // 0x0111 (2) - charging amp hours of the current day actual value
    // 0x0112 (2) - discharging amp hours of the current day actual value
    // 0x0113 (2) - power generation of the current day actual value
    // 0x0114 (2) - power consumption of the current day actual value
    //
    const registerBase = 0x010b;
    const registerLength = 10;

    this.readHoldingRegisters(registerBase, registerLength, (err, data) => {
      if (err != null) {
        if (this.trace)
          console.log("error reading historical data error=" + err);

        if (err.message != null && this.trace)
          if (this.trace)
            console.log(
              "error reading historical data error.message=" + err.message
            );

        callback(err, null);
        return;
      }

      //
      // modbus registers are 16 bit
      //
      hist.batteryVoltageMinForDay = data.buffer.readInt16BE(0); // 0x010B
      hist.batteryVoltageMaxForDay = data.buffer.readInt16BE(2); // 0x010C
      hist.maxChargeCurrentForDay = data.buffer.readInt16BE(4); // 0x010D
      hist.maxDischargeCurrentForDay = data.buffer.readInt16BE(6); // 0x010E
      hist.maxChargePowerForDay = data.buffer.readInt16BE(8); // 0x010F
      hist.maxDischargePowerForDay = data.buffer.readInt16BE(10); // 0x0110
      hist.chargeingAmpHoursForDay = data.buffer.readInt16BE(12); // 0x0111
      hist.dischargingAmpHoursForDay = data.buffer.readInt16BE(14); // 0x0112
      hist.powerGenerationForDay = data.buffer.readInt16BE(16); // 0x0113
      hist.powerConsumptionForDay = data.buffer.readInt16BE(18); // 0x0114

      callback(null, hist);
    });
  }
  //
  // callback(error, data)
  //
  // data is Buffer type.
  //
  readHoldingRegisters(base, length, callback) {
    try {
      //
      // apis/promise.js
      //    cl.readHoldingRegisters = _convert(cl.writeFC3);
      //      index.js
      //        ModbusRTU.prototype.writeFC3 = function(address, dataAddress, length, next) {
      //          this.writeFC4(address, dataAddress, length, next, 3);
      //        };
      //
      // modbus FC3 command.
      //
      this.client.readHoldingRegisters(base, length, (err, data) => {
        if (err != null) {
          if (this.trace) {
            console.log("readHoldingRegisters err=");
            console.dir(err, { depth: null });
          }
        }

        if (data != null) {
          if (this.trace) {
            console.log("data.data=");
            console.log(data.data);
          }
        }

        callback(err, data);
      });
    } catch (e) {
      if (this.trace) {
        console.log("readHoldingRegisters exception=");
        console.log(e);
      }
      callback(e, null);
    }
  }
  tracelog(config, message) {
    if (this.trace) console.log(message);
  }
  errlog(message) {
    if (this.traceError) console.error(message);
  }
}

module.exports = {
  RenogyRover: RenogyRover,
};

//
// These values are from the document "ROVER MODBUS.docx" supplied by Renogy Inc.
// customer service to the author in October 2017.
//
// note count () is in bytes. Modbus registers are two bytes each
// and modbus addresses are 16 bit word addresses, not byte addresses.
//
// 0x0000 (20) - Reserved.
//
// 0x000A (2) - Operating Parameters
//
//               Upper 8 bits max voltage support by the system
//
//               0CH (decimal 12)	12V
//               18H (decimal 24)	24V
//               24H (decimal 36)	36V
//               30H (decimal 48)	48V
//               60H (decimal 96)	96V
//               FFH (decimal 255)	Automatic recognition of system voltage
//
//               Lower 8 bits max rated charging current
//
//               0AH (decimal 10)	10A
//               14H (decimal 20)	20A
//               1EH (decimal 30)	30A
//               2DH (decimal 45)	45A
//               3CH (decimal 60)	60A
//
// 0x000B (2) - Operating Parameters 2
//
//               Upper 8 bits rated discharging current
//
//               0AH (decimal 10)	10A
//               14H (decimal 20)	20A
//               1EH (decimal 30)	30A
//               2DH (decimal 45)	45A
//               3CH (decimal 60)	60A
//
//               Lower 8 bits product type
//
//               00 (controller)
//               01 (inverter)
//               ...
//
// 0x000C (16) - Product Model.
// 0x0018 (4)  - product serial number
//
// 0x0100 (2) - Battery capacity SOC (state of charge)
// 0x0101 (2) - Battery voltage * 0.1
// 0x0102 (2) - Charging current to battery * 0.01
// 0x0103 (2) - Upper byte controller temperature bit 7 sign, bits 0 - 6 value
//            - Lower byte battery temperature bit 7 sign, bits 0 - 6 value
// 0x0107 (2) - Solar panel voltage  * 0.1
// 0x0108 (2) - Solar panel current * 0.01
// 0x0109 (2) - Charging Power actual value
// 0x010A (2) - light on/off command (write only 0 for off, 1 for on)
// 0x010B (2) - Battery min voltage of current day * 0.1
// 0x010C (2) - Battery max voltage of current day * 0.1
// 0x010D (2) - max charging current of current day * 0.01
// 0x010E (2) - max discharging current of current day * 0.01
// 0x010F (2) - max charging power of the current day actual value
// 0x0110 (2) - max discharging power of the current day actual value
// 0x0111 (2) - charging amp hours of the current day actual value
// 0x0112 (2) - discharging amp hours of the current day actual value
// 0x0113 (2) - power generation of the current day actual value
// 0x0114 (2) - power consumption of the current day actual value
//
// Historical Information
//
// 0x0115 (2) - total number of operating days
// 0x0116 (2) - total number of battery over-discharges
// 0x0117 (2) - total number of battery full discharges
// 0x0118 (4) - total charging amp-hrs of the battery actual value
// 0x011A (4) - total discharging amp-hrs of the battery actual value
// 0x011C (4) - cumulative power generation actual value
// 0x011E (4) - cumulative power consumption actual value
//
// 0x0120 (2) - charging state in 8 lower bits.
//            00H: charging deactivated
//            01H: charging activated
//            02H: mppt charging mode
//            03H: equalizing charging mode
//            04H: boost charging mode
//            05H: floating charging mode
//            06H: current limiting (overpower)
//
//            - upper 8 bits are street light status and brightness.
//
// 0x0121 (4) - controller fault and warning information
//            - 32 bit value of flags
//
//            B24: photovoltaic input side short circuit
//            B23: photovoltaic input overpower
//            B22: ambient temperature too high
//            B21: controller temperature too high
//            "B20: load overpower
//               or load over-current"
//            B19: load short circuit
//            B18: battery under-voltage warning
//            B17: battery over-voltage
//            B16: battery over-discharge
//            B0-B15 reserved
//
// Exxx range are read/write registers for setting various parameters.
// more are available than listed here.
//
// 0xE0002 (2) - nominal battery capacity
// 0xE0003 (2) - system voltage setting, recognized voltage
// 0xE0004 (2) - battery type open, sealed, gel, lithium, self-customized.
// 0xE0005 (2) - overvoltage threshhold 70 - 170
//
// 0xF000  (2) - Historical data of the current day
// 0xF001  (2) - Data before the current day
//

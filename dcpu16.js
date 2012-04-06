RAM_SIZE  = 0x10000;
WORD_SIZE = 2;
NUM_REG   = 12;
 
function DCPU16(logger) {
  this.Buffer = new ArrayBuffer(RAM_SIZE*WORD_SIZE + NUM_REG*WORD_SIZE);
  this.PC     = new Uint16Array(this.Buffer, 0,  1);
  this.SP     = new Uint16Array(this.Buffer, 2,  1);
  this.O      = new Uint16Array(this.Buffer, 4,  1);
  this.A      = new Uint16Array(this.Buffer, 6,  1);
  this.B      = new Uint16Array(this.Buffer, 8,  1);
  this.C      = new Uint16Array(this.Buffer, 10, 1);
  this.X      = new Uint16Array(this.Buffer, 12, 1);
  this.Y      = new Uint16Array(this.Buffer, 14, 1);
  this.Z      = new Uint16Array(this.Buffer, 16, 1);
  this.I      = new Uint16Array(this.Buffer, 18, 1);
  this.J      = new Uint16Array(this.Buffer, 20, 1);
  this.RAM    = new Uint16Array(this.Buffer, 22, RAM_SIZE);

  this.registers = [ this.A, this.B, this.C, this.X, this.Y, this.Z,
    this.I, this.J ];

  this.regNames = [ 'A', 'B', 'C', 'X', 'Y', 'Z', 'I', 'J ' ];

  this.SP[0]  = 0xffff;

  this.logger = logger;

  return this;
}

DCPU16.prototype.run = function(maxTicks) {
	var ticks = 0;

	while(ticks++ < maxTicks)
		this.tick();

	return this.Buffer;
}

DCPU16.prototype.load = function(bin) {
	for(var i = 0; i < bin.length && i < this.RAM.length; i++) {
		this.RAM[i] = bin[i];
	}
}

DCPU16.prototype.tick = function() {
  this.entry = new OperationLogEntry(this.PC[0]);

  var opcode = this.RAM[this.PC[0]] & 0x000F;
  var a = (this.RAM[this.PC[0]] & 0x01F8) >> 4;
  var b = (this.RAM[this.PC[0]] & 0xFE00) >> 10;

  var dst = this.getLoc(a);
  var src = this.getLoc(b);  

  this.entry.logLoc(src, this);
  this.entry.logLoc(dst, this);

  this.PC[0]++;

  if(this.skip) {
    this.skip = false;
    return
  }

  if(dst.isLiteral && opcode < 0xc)
    return;

  switch (opcode) {
    case 0x0:
      this.entry.dstLoc = "";
      switch (a) {
        case 0x1: //JSR
          this.entry.instruction = "JSR";
          this.RAM[--this.SP[0]] = this.PC[0];
          this.PC[0] = this.readLoc(src);
          break;
      }
      break;
    case 0x1: //SET
      this.entry.instruction = ("SET");
      dst.view[dst.offset] = this.readLoc(src);
      break;
    case 0x2: //ADD
      this.entry.instruction = ("ADD");
      res = dst.view[dst.offset] + this.readLoc(src);
      dst.view[dst.offset] = res;
      if(res & 0xffff !== 0)
        this.O[0] = 1;
      else
        this.O[0] = 0;
      break;
    case 0x3: //SUB
      this.entry.instruction = ("SUB");
      res = dst.view[dst.offset] - this.readLoc(src);
      dst.view[dst.offset] = res;
      if(res < 0)
        this.O[0] = 0xffff;
      else
        this.O[0] = 0;
      break;
    case 0x4: //MUL
      this.entry.instruction = ("MUL");
      res = dst.view[dst.offset] * this.readLoc(src);
      dst.view[dst.offset] = res & 0xffff;
      this.O[0] = (res >> 16) & 0xffff;
      break;
    case 0x5: //DIV
      this.entry.instruction = ("DIV");
      if(src.view[src.offset] === 0) { //divide by zero
        this.O[0] = 0;
        dst.view[dst.offset] = 0;
        break;
      }
      res = dst.view[dst.offset] / this.readLoc(src);
      dst.view[dst.offset] = res & 0xffff;
      this.O[0] = ((dst.view[dst.offset] << 16)/this.readLoc(src)) & 0xffff;
      break;
    case 0x6: //MOD
      this.entry.instruction = ("MOD");
      if(src.view[src.offset] === 0) { //divide by zero
        this.O[0] = 0;
        dst.view[dst.offset] = 0;
        break;
      }
      dst.view[dst.offset] %= this.readLoc(src);
      break;
    case 0x7: //SHL
      this.entry.instruction = ("SHL");
      res = dst.view[dst.offset] << this.readLoc(src);
      dst.view[dst.offset] = res & 0xffff;
      this.O[0] = (res >> 16) & 0xffff;
      break;
    case 0x8: //SHR
      this.entry.instruction = ("SHR");
      res = dst.view[dst.offset] >> this.readLoc(src);
      dst.view[dst.offset] = res & 0xffff;
      this.O[0] = ((dst.view[dst.offset] << 16) >> this.readLoc(src)) & 0xffff;
      break;
    case 0x9: //AND
      this.entry.instruction = ("AND");
      dst.view[dst.offset] &= this.readLoc(src);
      break;
    case 0xa: //BOR
      this.entry.instruction = ("BOR");
      dst.view[dst.offset] |= this.readLoc(src);
      break;
    case 0xb: //XOR
      this.entry.instruction = ("XOR");
      dst.view[dst.offset] ^= this.readLoc(src);
      break;
    case 0xc: //IFE
      this.entry.instruction = ("IFE");
      this.skip = (! this.readLoc(dst) === this.readLoc(src))
      break;
    case 0xd: //IFN
      this.entry.instruction = ("IFN");
      this.skip = (this.readLoc(dst) === this.readLoc(src))
      break;
    case 0xe: //IFG
      this.entry.instruction = ("IFG");
      this.skip = (this.readLoc(dst) <= this.readLoc(src))
      break;
    case 0xf: //IFB
      this.entry.instruction = ("IFB");
      this.skip = ((this.readLoc(dst) & this.readLoc(src)) === 0)
      break;
  }

  this.logger.write(this.entry.toString());
}

DCPU16.prototype.getLoc = function(lCode) {
  var loc = null;
  switch (lCode) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      loc = new MemLoc(this.registers[lCode], 0);   
      break;
    case 8:
    case 9:
    case 0xa:
    case 0xb:
    case 0xc:
    case 0xd:
    case 0xe:
    case 0xf:
      loc = new MemLoc(this.RAM, this.registers[lCode - 8][0]);
      break;
    case 0x10:
    case 0x11:
    case 0x12:
    case 0x13:
    case 0x14:
    case 0x15:
    case 0x16:
    case 0x17:
      loc = new MemLoc(this.RAM, 
          this.registers[lCode-0x10][0] + this.RAM[++this.PC[0]]);
      break;
    case 0x18:
      loc = new MemLoc(this.RAM, this.SP[0]++);
      break;
    case 0x19:
      loc = new MemLoc(this.RAM, this.SP[0]);
      break;
    case 0x1a:
      loc = new MemLoc(this.RAM, --this.SP[0]);
      break;
    case 0x1b:
      loc = new MemLoc(this.SP, 0);
      break;
    case 0x1c:
      loc = new MemLoc(this.PC, 0);
      break;
    case 0x1d:
      loc = new MemLoc(this.O, 0);
      break;
    case 0x1e:
      loc = new MemLoc(this.RAM, this.RAM[++this.PC[0]]);
      break;
    case 0x1f:
      loc = new Literal(this.RAM[++this.PC[0]]);
      break;
    default:
      loc = new Literal(lCode - 0x20);
      break;
  }
  return loc;
}

DCPU16.prototype.readLoc = function(loc) {
  return loc.isLiteral ? loc.value : loc.view[loc.offset];
}

function MemLoc(view, offset) {
  this.view   = view;
  this.offset = offset;
  this.isLiteral = false;
}

function Literal(val) {
  this.value = val;
  this.isLiteral = true;
}

function Logger() {
  this.log = "";
}

Logger.prototype.write = function(msg) {
  this.log += msg+"\n";
}

function OperationLogEntry(adr) {
  this.address     = adr;
  this.srcLoc      = null;
  this.dstLoc      = null;
  this.instruction = null;
}

OperationLogEntry.prototype.toString = function() {
  return dtoh(this.address) + ":\t" + this.instruction + "\t" + this.dstLoc + ",\t" + this.srcLoc;
}

OperationLogEntry.prototype.logLoc = function(loc, cpu) {
  var res = "";
  if(loc.isLiteral)
    res = dtoh(loc.value);
  else {
    if(loc.offset > 0) //hacky way to tell if loc is a register
      res = "[" + dtoh(loc.offset) + "]";
    else {
      res = "Register "
      var i = cpu.registers.indexOf(loc.view);
      if(i >= 0)
        res += cpu.regNames[cpu.registers.indexOf(loc.view)];
      else
        switch(loc.view) {
          case (cpu.PC):
            res += "PC";
            break;
          case (cpu.SP):
            res += "SP";
            break;
          case (cpu.O):
            res += "O";
            break;
        }
    }
  }

  if(this.srcLoc === null) {
    this.srcLoc = res;
    return;
  }

  this.dstLoc = res;
}

function dtoh(dec) {
  var res = "";
  var chars = [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F' ];

  do {
    res = chars[dec % 16] + res;
    dec = Math.floor(dec/16);
  } while(dec > 0);

  if(res.length < 4)
    for(var i = 4 - res.length; i > 0; i--)
      res = "0" + res;

  return "0x" + res;
}

function dtob(dec) {
  var res = "";
  var chars = [ '0', '1' ];

  do {
    res = chars[ dec % 2 ] + res;
    dec = Math.floor(dec/2);
  } while(dec > 0);

  if(res.length < 16)
    for(var i = 16 - res.length; i > 0; i--)
      res = "0" + res;

  return "0b" + res;
}

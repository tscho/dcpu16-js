RAM_SIZE  = 0x10000;
WORD_SIZE = 2;
NUM_REG   = 12;
 
function DCPU16() {
  this.Buffer = new ArrayBuffer(RAM_SIZE*WORD_SIZE + NUM_REG*WORD_SIZE);
  this.PC     = new Uint16Array(buffer, 0,  1);
  this.SP     = new Uint16Array(buffer, 2,  1);
  this.O      = new Uint16Array(buffer, 4,  1);
  this.A      = new Uint16Array(buffer, 6,  1);
  this.B      = new Uint16Array(buffer, 8,  1);
  this.C      = new Uint16Array(buffer, 10, 1);
  this.X      = new Uint16Array(buffer, 12, 1);
  this.Y      = new Uint16Array(buffer, 14, 1);
  this.Z      = new Uint16Array(buffer, 16, 1);
  this.I      = new Uint16Array(buffer, 18, 1);
  this.J      = new Uint16Array(buffer, 20, 1);
  this.RAM    = new Uint16Array(buffer, 22, RAM_SIZE);

  this.registers = [ this.A, this.B, this.C, this.X, this.Y, this.Z,
    this.I, this.J ];

  this.SP[0]  = 0xffff;
  this.queue  = [];

  return this;
}

DCPU16.prototype.tick = function() {
  var opcode = this.RAM[this.PC[0]] & 0x000F;
  var a = (this.RAM[this.PC[0]] & 0x01F8) >> 4;
  var b = (this.RAM[this.PC[0]] & 0xFE00) >> 10;

  //hook up src/destination
  var src = this.getLoc(b);
  var dst = this.getLoc(a);

  if(dst.isLiteral && opcode < 0xc)
    return;

  switch (opcode) {
    case 0x0:
      switch (b) {
        case 0x1:
          this.RAM[--this.SP[0]] = this.PC[0]+1;
          this.PC[0] = a;
          break;
      }
      break;
    case 0x1: //SET
      dst.view[dst.offset] = this.readLoc(src);
      break;
    case 0x2: //ADD
      res = dst.view[dst.offset] + this.readLoc(src);
      dst.view[dst.offset] = res;
      if(res & 0xffff !== 0)
        this.O[0] = 1;
      else
        this.O[0] = 0;
      break;
    case 0x3: //SUB
      res = dst.view[dst.offset] - this.readLoc(src);
      dst.view[dst.offset] = res;
      if(res < 0)
        this.O[0] = 0xffff;
      else
        this.O[0] = 0;
      break;
    case 0x4: //MUL
      res = dst.view[dst.offset] * this.readLoc(src);
      dst.view[dst.offset] = res & 0xffff;
      this.O[0] = (res >> 16) & 0xffff;
      break;
    case 0x5: //DIV
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
      if(src.view[src.offset] === 0) { //divide by zero
        this.O[0] = 0;
        dst.view[dst.offset] = 0;
        break;
      }
      dst.view[dst.offset] %= this.readLoc(src);
      break;
    case 0x7: //SHL
      res = dst.view[dst.offset] << this.readLoc(src);
      dst.view[dst.offset] = res & 0xffff;
      this.O[0] = (res >> 16) & 0xffff;
      break;
    case 0x8: //SHR
      res = dst.view[dst.offset] >> this.readLoc(src);
      dst.view[dst.offset] = res & 0xffff;
      this.O[0] = ((dst.view[dst.offset] << 16) >> this.readLoc(src)) & 0xffff;
      break;
    case 0x9: //AND
      dst.view[dst.offset] &= this.readLoc(src);
      break;
    case 0xa: //BOR
      dst.view[dst.offset] |= this.readLoc(src);
      break;
    case 0xb: //XOR
      dst.view[dst.offset] ^= this.readLoc(src);
      break;
    case 0xc: //IFE
      if (! this.readLoc(dst) === this.readLoc(src))
        this.PC[0]++
      break;
    case 0xd: //IFN
      if (this.readLoc(dst) === this.readLoc(src))
        this.PC[0]++
      break;
    case 0xe: //IFG
      if (this.readLoc(dst) <= this.readLoc(src))
        this.PC[0]++
      break;
    case 0xf: //IFB
      if ((this.readLoc(dst) & this.readLoc(src)) === 0)
        this.PC[0]++
      break;
  }
  this.PC[0]++;
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
      loc = new MemLoc(this.RAM, this.registers[lCode - 8][0])
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
      loc = new MemLoc(this.RAM, this.RAM[this.SP[0]++]);
      break;
    case 0x19:
      loc = new MemLoc(this.RAM, this.RAM[this.SP[0]]);
      break;
    case 0x1a:
      loc = new MemLoc(this.RAM, this.RAM[--this.SP[0]]);
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

function dcpu16() {
  return new DCPU16();
}

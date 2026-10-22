export class CommandHistory {
  #commands: string[] = [];
  #position = 0;
  #draft = "";

  add(command: string): void {
    if (command.replace(/^:+/, "").trim().length > 0) this.#commands.push(command);
    this.reset();
  }

  previous(currentText: string): string {
    if (this.#commands.length === 0) return currentText;
    if (this.#position === this.#commands.length) this.#draft = currentText;
    if (this.#position > 0) this.#position--;
    return this.#commands[this.#position];
  }

  next(currentText: string): string {
    if (this.#commands.length === 0 || this.#position >= this.#commands.length) return currentText;
    this.#position++;
    return this.#position === this.#commands.length ? this.#draft : this.#commands[this.#position];
  }

  reset(): void {
    this.#position = this.#commands.length;
    this.#draft = "";
  }
}

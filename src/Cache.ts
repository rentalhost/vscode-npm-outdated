export class Cache<T> {
  private at: number | undefined;

  public constructor(public value: T) {
    this.at = Date.now();
    this.value = value;
  }

  // Checks if the cache is still valid, being within lifetime.
  public isValid(lifetime: number): boolean {
    return Boolean(this.at !== undefined && this.at >= Date.now() - lifetime);
  }

  public invalidate(): void {
    this.at = undefined;
  }
}

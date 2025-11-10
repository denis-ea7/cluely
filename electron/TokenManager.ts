import fs from "fs"
import path from "path"
import { app } from "electron"

export class TokenManager {
  private tokenPath: string
  private cached: string | null = null

  constructor() {
    const dir = app.getPath("userData")
    this.tokenPath = path.join(dir, "token.json")
  }

  public load(): string | null {
    try {
      const raw = fs.readFileSync(this.tokenPath, "utf8")
      const data = JSON.parse(raw)
      this.cached = data?.token || null
      return this.cached
    } catch {
      return null
    }
  }

  public save(token: string): void {
    this.cached = token
    fs.writeFileSync(this.tokenPath, JSON.stringify({ token }), "utf8")
  }

  public clear(): void {
    this.cached = null
    try { fs.unlinkSync(this.tokenPath) } catch {}
  }
}



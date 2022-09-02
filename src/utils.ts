/* eslint-disable @typescript-eslint/promise-function-async */
/* eslint-disable github/no-then */
import * as fs from 'fs'
import { parse } from 'semver'
import lineReplace from 'line-replace'
import { AsyncLineReader } from 'async-line-reader'

function asyncLineReplace(
    file: string,
    line: number,
    text: string,
    addNewLine: boolean
): Promise<{ file: string; line: number; text: string; replacedText: string }> {
    return new Promise((resolve, reject) => {
        lineReplace(
            file,
            line,
            text,
            addNewLine,
            function (par0, par1, par2, par3, par4) {
                //stupid shallow rule thing forces naming with 'parN'
                if (par4) {
                    reject(par4)
                } else {
                    resolve({
                        file: par0,
                        line: par1,
                        text: par2,
                        replacedText: par3
                    })
                }
            }
        )
    })
}

export interface Cargo {
    name: string
    version: string
    versionLineId: number
}

export function exists(path: string): Promise<boolean> {
    return fs.promises
        .access(path, fs.constants.R_OK)
        .then(() => true)
        .catch(() => false)
}

export async function loadCargo(path: string): Promise<Cargo> {
    const result = {
        name: '',
        version: '',
        versionLineId: 0
    }
    const stream = fs.createReadStream(path, 'utf8')
    const reader = new AsyncLineReader(stream)
    const nameRegex = /name = "(.+)"/
    const versionRegex = /version = "([0-9]+.[0-9]+.[0-9]+(-.+)?)"/
    let line
    let lineId = 0
    while ((line = await reader.readLine())) {
        lineId += 1
        const name = line.match(nameRegex)
        const version = line.match(versionRegex)
        if (name) result.name = name[1]
        if (version) {
            result.version = version[1]
            result.versionLineId = lineId
        }
        //If all inormation was retrieved stop to avoid further iterations
        if (result.name && result.version) break
    }
    return result
}

export async function saveCargo(path: string, project: Cargo): Promise<void> {
    await asyncLineReplace(path, project.versionLineId, project.version, false)
}

interface VersionNumber {
    minor: number
    major: number
    patch: number
}

export class Version {
    private core: VersionNumber
    private channel: string | null
    private preRelease: VersionNumber | null
    private lock: boolean

    constructor(
        core: VersionNumber,
        channel: string | null,
        preRelease: VersionNumber | null
    ) {
        this.core = core
        this.channel = channel
        this.preRelease = preRelease
        this.lock = false
    }

    jumpChannel(channel: string | null) {
        if (this.channel) {
            if (channel) {
                this.channel = channel
            } else {
                this.channel = null
                this.preRelease = null
                this.lock = true
            }
        } else {
            this.channel = channel
            this.preRelease = null
        }
    }

    bumpMinor() {
        if (this.channel) {
            if (this.preRelease) {
                this.preRelease.minor += 1
            } else {
                this.core.minor += 1
                this.preRelease = { minor: 1, major: 0, patch: 0 }
            }
        } else if (!this.lock) {
            this.core.minor += 1
        }
    }

    bumpMajor() {
        if (this.channel) {
            if (this.preRelease) {
                this.preRelease.major += 1
            } else {
                this.core.major += 1
                this.preRelease = { minor: 0, major: 1, patch: 0 }
            }
        } else if (!this.lock) {
            this.core.major += 1
        }
    }

    bumpPatch() {
        if (this.channel) {
            if (this.preRelease) {
                this.preRelease.patch += 1
            } else {
                this.core.patch += 1
                this.preRelease = { minor: 0, major: 0, patch: 1 }
            }
        } else if (!this.lock) {
            this.core.patch += 1
        }
    }

    format(): string {
        if (this.channel) {
            return `${this.core.major}.${this.core.minor}.${this.core.patch}-${this.channel}.${this.preRelease?.major}.${this.preRelease?.minor}.${this.preRelease?.patch}`
        } else {
            return `${this.core.major}.${this.core.minor}.${this.core.patch}`
        }
    }
}

export function parseVersion(version: string): Version {
    const v = parse(version)
    if (!v) throw new EvalError('Could not parse semver version')
    const core = { minor: v.minor, major: v.major, patch: v.patch }
    if (v.prerelease.length === 0) return new Version(core, null, null)
    if (v.prerelease.length !== 4)
        throw new EvalError('Could not parse pre-release version information')
    let channel = v.prerelease[0].toString()
    const major = v.prerelease[1]
    const minor = v.prerelease[2]
    const patch = v.prerelease[3]
    if (channel.endsWith('-'))
        channel = channel.substring(0, channel.length - 1)
    if (
        typeof minor != 'number' ||
        typeof major != 'number' ||
        typeof patch != 'number'
    )
        throw new EvalError('Could not parse pre-release version information')
    const preRelease = { minor, major, patch }
    return new Version(core, channel, preRelease)
}

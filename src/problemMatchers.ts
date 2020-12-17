import { tasks, TaskExecution } from 'vscode'
import path from 'path'
import fs from 'fs'
import os from 'os'

//#region ProblemMatcher Schema 

/**
 * via [API Docs Appendix](https://code.visualstudio.com/docs/editor/tasks-appendix)
 */

/**
 * A description of a problem matcher that detects problems
 * in build output.
 */
interface ProblemMatcher {
  /**
   * The name of a base problem matcher to use. If specified the
   * base problem matcher will be used as a template and properties
   * specified here will replace properties of the base problem
   * matcher
   */
  base?: string;

  /**
   * The owner of the produced VS Code problem. This is typically
   * the identifier of a VS Code language service if the problems are
   * to be merged with the one produced by the language service
   * or 'external'. Defaults to 'external' if omitted.
   */
  owner?: string;

  /**
   * The severity of the VS Code problem produced by this problem matcher.
   *
   * Valid values are:
   *   "error": to produce errors.
   *   "warning": to produce warnings.
   *   "info": to produce infos.
   *
   * The value is used if a pattern doesn't specify a severity match group.
   * Defaults to "error" if omitted.
   */
  severity?: string;

  /**
   * Defines how filename reported in a problem pattern
   * should be read. Valid values are:
   *  - "absolute": the filename is always treated absolute.
   *  - "relative": the filename is always treated relative to
   *    the current working directory. This is the default.
   *  - ["relative", "path value"]: the filename is always
   *    treated relative to the given path value.
   *  - "autodetect": the filename is treated relative to
   *    the current workspace directory, and if the file
   *    does not exist, it is treated as absolute.
   *  - ["autodetect", "path value"]: the filename is treated
   *    relative to the given path value, and if it does not
   *    exist, it is treated as absolute.
   */
  fileLocation?: 
    | "absolute" 
    | "relative" 
    | "autodetect"
    | [ "autodetect" | "relative", string]
    | [ "autodetect" | "relative" ];

  /**
   * The name of a predefined problem pattern, the inline definition
   * of a problem pattern or an array of problem patterns to match
   * problems spread over multiple lines.
   */
  pattern?: string | ProblemPattern | ProblemPattern[];

  /**
   * Additional information used to detect when a background task (like a watching task in Gulp)
   * is active.
   */
  background?: BackgroundMatcher;
}

/**
 * A description to track the start and end of a background task.
 */
interface BackgroundMatcher {
  /**
   * If set to true the watcher is in active mode when the task
   * starts. This is equals of issuing a line that matches the
   * beginPattern.
   */
  activeOnStart?: boolean;

  /**
   * If matched in the output the start of a background task is signaled.
   */
  beginsPattern?: string;

  /**
   * If matched in the output the end of a background task is signaled.
   */
  endsPattern?: string;
}

interface ProblemPattern {
  /**
   * The regular expression to find a problem in the console output of an
   * executed task.
   */
  regexp: string;

  /**
   * Whether the pattern matches a problem for the whole file or for a location
   * inside a file.
   *
   * Defaults to "location".
   */
  kind?: 'file' | 'location';

  /**
   * The match group index of the filename.
   */
  file: number;

  /**
   * The match group index of the problem's location. Valid location
   * patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn).
   * If omitted the line and column properties are used.
   */
  location?: number;

  /**
   * The match group index of the problem's line in the source file.
   * Can only be omitted if location is specified.
   */
  line?: number;

  /**
   * The match group index of the problem's column in the source file.
   */
  column?: number;

  /**
   * The match group index of the problem's end line in the source file.
   *
   * Defaults to undefined. No end line is captured.
   */
  endLine?: number;

  /**
   * The match group index of the problem's end column in the source file.
   *
   * Defaults to undefined. No end column is captured.
   */
  endColumn?: number;

  /**
   * The match group index of the problem's severity.
   *
   * Defaults to undefined. In this case the problem matcher's severity
   * is used.
   */
  severity?: number;

  /**
   * The match group index of the problem's code.
   *
   * Defaults to undefined. No code is captured.
   */
  code?: number;

  /**
   * The match group index of the message. Defaults to 0.
   */
  message: number;

  /**
   * Specifies if the last pattern in a multi line problem matcher should
   * loop as long as it does match a line consequently. Only valid on the
   * last problem pattern in a multi line problem matcher.
   */
  loop?: boolean;
}

interface ProblemPatternLiteral extends Omit<ProblemPattern, 'regexp'>
{
    regexp: string | RegExp;
}

//#endregion ProblemMatcher Schema

interface ProblemMatcherRegexpLiteral extends Omit<ProblemMatcher, 'pattern'>
{
    pattern: ProblemPatternLiteral | ProblemPatternLiteral[] | string;
}

abstract class ProblemMatcherConfig
{
    pattern!:      ProblemMatcherRegexpLiteral['pattern'];

    background?:   BackgroundMatcher;
    base?:         string;
    fileLocation?: ProblemMatcher['fileLocation'];
    owner:         ProblemMatcher['owner'];
    severity?:     ProblemMatcher['severity'];

    constructor(pattern?: ProblemMatcherRegexpLiteral['pattern'])
    {
        if(pattern)
            this.pattern = pattern;
    }
}

class StylusProblemMatcher extends ProblemMatcherConfig
{
    applyTo              = "allDocuments"
    label                = "Stylus Compilation Error Matcher"
    matcherName?: string = "stylus"
    
    // source               = "stylus"
    // owner                = "stylus"
    
    fileLocation: ProblemMatcherConfig['fileLocation'] = ['autodetect'];
    
    pattern = 
    {
        regexp: /(?:^[ ]*(?:(?:[\[])?((?:Parse)?Error): *)(((?!stdin)\S(?:[^\n:\\]+|(?:\\.)+)+)(?::(\d+)(?::(\d+))?)?) *$)/,
        file: 3,
        line: 4,
        column: 5,
        // kind: 'location',
        // Not ideal but better than $0 until looping parse added
        message: 2,
        // severity: 1,
    } as ProblemPatternLiteral

    
    constructor(pattern: ProblemMatcherConfig['pattern'] | undefined = undefined) 
    { 
        super(pattern) 

        if(typeof pattern !== 'undefined')
        {
            if(pattern instanceof RegExp)
                // @ts-expect-error
                this.pattern = pattern.source;
            else if (typeof pattern === 'string')
                // @ts-expect-error
                this.pattern = pattern;
            // Just assume its a ProblemMatcher
            else if (typeof pattern === 'object')
                // @ts-expect-error
                this.pattern = pattern
            else
                throw new Error('Supplied pattern argument is neither string nor RegExp instance.')
        }
        else if(!this.pattern)
        {
            throw new Error('pattern member not passed in constructor argument or defined in member literal.')
        }
        else if(this.pattern instanceof RegExp)
        {
            // @ts-expect-error
            this.pattern = this.pattern.source;
        }
    }

    static toJSONObj()
    {
        const instance = new StylusProblemMatcher();
        
        const config = {...instance};
        // Store value to insert before removing
        let matcherName = config.matcherName
        delete config.matcherName
        
        let pattern = config.pattern
        let patternValue;
        let patternObj = pattern as ProblemMatcherRegexpLiteral['pattern'];
        if(Array.isArray(patternObj))
        {
            patternObj = patternObj.map(o => {
                if(o.regexp instanceof RegExp)
                    o.regexp = o.regexp.source;
                return o
            })
            patternValue = patternObj
        }
        else if(typeof patternObj === 'object')
        {
            if(patternObj.regexp instanceof RegExp)
                patternObj.regexp = patternObj.regexp.source;

            patternValue = patternObj
        }

        const build = 
        {
            ...config,
            name: matcherName,
            pattern: patternValue
        }

        console.log(`JSON Preview: ${JSON.stringify(build, null, 4)}`)
    
        return build
    }
}

console.log(StylusProblemMatcher.toJSONObj())

function updatePackage(extensionPackageJSONPath: string = path.resolve(__dirname, '../package.json')): void
{
    if(!(fs.existsSync(extensionPackageJSONPath)))
    {
        console.error(`Extension package.json not found at path: ${extensionPackageJSONPath}.`)
        return
    }

    console.log(`Importing package.json data from ${extensionPackageJSONPath}`)


    const pkg = require(extensionPackageJSONPath) as typeof import('../package.json');

    const backupPackageJSONPath = path.resolve(os.tmpdir(), `package.json`)
    console.log(`Backing up existing package.json data to ${backupPackageJSONPath}`)
    fs.writeFileSync( backupPackageJSONPath, JSON.stringify(pkg, null, 4), 'utf-8' )

    Object.assign(pkg.contributes, {
        problemMatchers: [StylusProblemMatcher.toJSONObj()]
    });

    console.log(`Writing updated package.json to ${extensionPackageJSONPath}`)

    fs.writeFileSync( extensionPackageJSONPath, JSON.stringify(pkg, null, 4), 'utf-8' )
}


updatePackage()
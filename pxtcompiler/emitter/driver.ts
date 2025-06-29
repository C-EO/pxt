/// <reference path="../../localtypings/pxtarget.d.ts"/>
// TODO: enable reference so we don't need to use: (pxt as any).py
//      the issue is that this creates a circular dependency. This
//      is easily handled if we used proper TS modules.
//// <reference path="../../built/pxtpy.d.ts"/>

// Enforce order:
/// <reference path="thumb.ts"/>
/// <reference path="ir.ts"/>
/// <reference path="emitter.ts"/>
/// <reference path="backthumb.ts"/>
/// <reference path="decompiler.ts"/>

namespace ts.pxtc {
    export interface CompileResult {
        // Extend the CompileResult interface with ts specific fields
        ast?: Program;
    }

    export function getTsCompilerOptions(opts: CompileOptions) {
        let options = ts.getDefaultCompilerOptions()

        options.target = ts.ScriptTarget.ES5;
        options.module = ModuleKind.None;
        options.noImplicitAny = true;
        options.noImplicitReturns = true;
        options.allowUnreachableCode = true;

        return {
            ...options,
            ...opts?.tsCompileOptions
        };
    }

    export function nodeLocationInfo(node: ts.Node) {
        let file = getSourceFileOfNode(node)
        const nodeStart = node.getStart ? node.getStart() : node.pos;
        const { line, character } = ts.getLineAndCharacterOfPosition(file, nodeStart);
        const { line: endLine, character: endChar } = ts.getLineAndCharacterOfPosition(file, node.end);
        let r: LocationInfo = {
            start: nodeStart,
            length: node.end - nodeStart,
            line: line,
            column: character,
            endLine: endLine,
            endColumn: endChar,
            fileName: file.fileName,
        }
        return r
    }

    export function patchUpDiagnostics(diags: ReadonlyArray<Diagnostic>, ignoreFileResolutionErorrs = false) {
        if (ignoreFileResolutionErorrs) {
            // Because we generate the program and the virtual file system, we can safely ignore
            // file resolution errors. They are generated by triple slash references that likely
            // have a different path format than the one our dumb file system expects. The files
            // are included, our compiler host just isn't smart enough to resolve them.
            diags = diags.filter(d => d.code !== 5012);
        }
        let highPri = diags.filter(d => d.code == 1148)
        if (highPri.length > 0)
            diags = highPri;
        return diags.map(d => {
            if (!d.file) {
                let rr: KsDiagnostic = {
                    code: d.code,
                    start: d.start,
                    length: d.length,
                    line: 0,
                    column: 0,
                    messageText: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
                    category: d.category,
                    fileName: "?",
                }
                return rr
            }

            const pos = ts.getLineAndCharacterOfPosition(d.file, d.start);
            let r: KsDiagnostic = {
                code: d.code,
                start: d.start,
                length: d.length,
                line: pos.line,
                column: pos.character,
                messageText: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
                category: d.category,
                fileName: d.file.fileName,
            }
            if (r.code == 1148)
                r.messageText = Util.lf("all symbols in top-level scope are always exported; please use a namespace if you want to export only some")
            return r
        })
    }

    export function py2tsIfNecessary(opts: CompileOptions): transpile.TranspileResult | undefined {
        if (opts.target.preferredEditor == pxt.PYTHON_PROJECT_NAME) {
            let res = pxtc.transpile.pyToTs(opts)
            return res
        }
        return undefined
    }

    function mkCompileResult(): CompileResult {
        return {
            outfiles: {},
            diagnostics: [],
            success: false,
            times: {},
        }
    }

    export function storeGeneratedFiles(opts: CompileOptions, res: CompileResult) {
        // save files first, in case we generated some .ts files that fail to compile
        for (let f of opts.generatedFiles || [])
            res.outfiles[f] = opts.fileSystem[f]
    }

    export function runConversionsAndStoreResults(opts: CompileOptions, res?: CompileResult): CompileResult {
        const startTime = U.cpuUs()
        if (!res) {
            res = mkCompileResult();
        }
        const convRes = py2tsIfNecessary(opts)
        if (convRes) {
            res = { ...res, diagnostics: convRes.diagnostics, sourceMap: convRes.sourceMap, globalNames: convRes.globalNames }
        }

        storeGeneratedFiles(opts, res)

        if (!opts.sourceFiles)
            opts.sourceFiles = Object.keys(opts.fileSystem)
        // ensure that main.ts is last of TS files
        const idx = opts.sourceFiles.indexOf(pxt.MAIN_TS)
        if (idx >= 0) {
            opts.sourceFiles.splice(idx, 1)
            opts.sourceFiles.push(pxt.MAIN_TS)
        }

        // run post-processing code last, if present
        const postIdx = opts.sourceFiles.indexOf(pxt.TUTORIAL_CODE_STOP)
        if (postIdx >= 0) {
            opts.sourceFiles.splice(postIdx, 1)
            opts.sourceFiles.push(pxt.TUTORIAL_CODE_STOP)
        }

        res.times["conversions"] = U.cpuUs() - startTime

        return res
    }

    export function timesToMs(res: CompileResult) {
        for (let k of Object.keys(res.times)) {
            res.times[k] = Math.round(res.times[k]) / 1000
        }
    }

    function buildProgram(opts: CompileOptions, res: CompileResult) {
        let fileText: { [index: string]: string } = {};
        for (let fileName in opts.fileSystem) {
            fileText[normalizePath(fileName)] = opts.fileSystem[fileName];
        }

        let setParentNodes = true
        let options = getTsCompilerOptions(opts)

        let host: CompilerHost = {
            getSourceFile: (fn, v, err) => {
                fn = normalizePath(fn)
                let text = ""
                if (fileText.hasOwnProperty(fn)) {
                    text = fileText[fn]
                } else {
                    if (err) err("File not found: " + fn)
                }
                if (text == null) {
                    err("File not found: " + fn)
                    text = ""
                }
                return createSourceFile(fn, text, v, setParentNodes)
            },
            fileExists: fn => {
                fn = normalizePath(fn)
                return fileText.hasOwnProperty(fn)
            },
            getCanonicalFileName: fn => fn,
            getDefaultLibFileName: () => "no-default-lib.d.ts",
            writeFile: (fileName, data, writeByteOrderMark, onError) => {
                res.outfiles[fileName] = data
            },
            getCurrentDirectory: () => ".",
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\n",
            readFile: fn => {
                fn = normalizePath(fn)
                return fileText[fn] || "";
            },
            directoryExists: dn => true,
            getDirectories: () => []
        }

        let tsFiles = opts.sourceFiles.filter(f => U.endsWith(f, ".ts"))
        return createProgram(tsFiles, options, host);
    }

    export function isPxtModulesFilename(filename: string) {
        return U.startsWith(filename, "pxt_modules/")
    }

    export interface CompilerHooks {
        init?(opts: CompileOptions, service?: LanguageService): void;
        preBinary?(program: Program, opts: CompileOptions, res: CompileResult): void;
        postBinary?(program: Program, opts: CompileOptions, res: CompileResult): void;
    }
    export let compilerHooks: CompilerHooks

    export function compile(opts: CompileOptions, service?: LanguageService) {
        if (!compilerHooks) {
            // run the extension at most once
            compilerHooks = {}

            // The extension JavaScript code comes from target.json. It is generated from compiler/*.ts in target by 'pxt buildtarget'
            if (opts.target.compilerExtension)
                // eslint-disable-next-line
                eval(opts.target.compilerExtension)
        }

        if (compilerHooks.init)
            compilerHooks.init(opts, service)

        let startTime = U.cpuUs()
        let res = mkCompileResult()

        let program: Program

        if (service) {
            storeGeneratedFiles(opts, res)
            program = service.getProgram()
        } else {
            runConversionsAndStoreResults(opts, res)
            if (res.diagnostics.length > 0)
                return res;
            program = buildProgram(opts, res)
        }

        const entryPoint = opts.sourceFiles.filter(f => U.endsWith(f, ".ts")).pop().replace(/.*\//, "")

        // First get and report any syntactic errors.
        res.diagnostics = patchUpDiagnostics(program.getSyntacticDiagnostics(), opts.ignoreFileResolutionErrors);
        if (res.diagnostics.length > 0) {
            if (opts.forceEmit) {
                pxt.debug('syntactic errors, forcing emit')
                compileBinary(program, opts, res, entryPoint);
            }
            return res;
        }

        // If we didn't have any syntactic errors, then also try getting the global and
        // semantic errors.
        res.diagnostics = patchUpDiagnostics(program.getOptionsDiagnostics().concat(Util.toArray(program.getGlobalDiagnostics())), opts.ignoreFileResolutionErrors);

        const semStart = U.cpuUs()

        if (res.diagnostics.length == 0) {
            res.diagnostics = patchUpDiagnostics(program.getSemanticDiagnostics(), opts.ignoreFileResolutionErrors);
        }

        const emitStart = U.cpuUs()
        res.times["typescript-syn"] = semStart - startTime
        res.times["typescript-sem"] = emitStart - semStart
        res.times["typescript"] = emitStart - startTime

        if (opts.ast) {
            res.ast = program
        }

        if (opts.ast || opts.forceEmit || res.diagnostics.length == 0) {
            const binOutput = compileBinary(program, opts, res, entryPoint);
            res.times["compilebinary"] = U.cpuUs() - emitStart
            res.diagnostics = res.diagnostics.concat(patchUpDiagnostics(binOutput.diagnostics))
        }

        if (res.diagnostics.length == 0)
            res.success = true

        for (let f of opts.sourceFiles) {
            if (Util.startsWith(f, "built/"))
                res.outfiles[f.slice(6)] = opts.fileSystem[f]
        }

        res.times["all"] = U.cpuUs() - startTime;
        pxt.tickEvent(`compile`, res.times);
        return res
    }

    export function decompile(program: Program, opts: CompileOptions, fileName: string, includeGreyBlockMessages = false) {
        let file = program.getSourceFile(fileName);
        annotate(program, fileName, target || (pxt.appTarget && pxt.appTarget.compile));
        const apis = getApiInfo(program, opts.jres);
        const blocksInfo = pxtc.getBlocksInfo(apis, opts.bannedCategories);
        const decompileOpts: decompiler.DecompileBlocksOptions = {
            snippetMode: opts.snippetMode || false,
            alwaysEmitOnStart: opts.alwaysDecompileOnStart,
            includeGreyBlockMessages,
            generateSourceMap: opts.generateSourceMap !== undefined ? opts.generateSourceMap : !!opts.ast,
            allowedArgumentTypes: opts.allowedArgumentTypes || ["number", "boolean", "string"],
            errorOnGreyBlocks: !!opts.errorOnGreyBlocks
        };
        const [renameMap, _] = pxtc.decompiler.buildRenameMap(program, file, { declarations: "variables", takenNames: {} })
        const bresp = pxtc.decompiler.decompileToBlocks(blocksInfo, file, decompileOpts, renameMap);
        return bresp;
    }

    // Decompile an array of code snippets (sourceTexts) to XML strings (blocks)
    export function decompileSnippets(program: Program, opts: CompileOptions, includeGreyBlockMessages = false) {
        const apis = getApiInfo(program, opts.jres);
        const blocksInfo = pxtc.getBlocksInfo(apis, opts.bannedCategories);
        const renameMap = new pxtc.decompiler.RenameMap([]); // Don't rename for snippets

        const decompileOpts: decompiler.DecompileBlocksOptions = {
            snippetMode: opts.snippetMode || false,
            alwaysEmitOnStart: opts.alwaysDecompileOnStart,
            includeGreyBlockMessages,
            generateSourceMap: opts.generateSourceMap !== undefined ? opts.generateSourceMap : !!opts.ast,
            allowedArgumentTypes: opts.allowedArgumentTypes || ["number", "boolean", "string"],
            errorOnGreyBlocks: !!opts.errorOnGreyBlocks
        };

        let programCache: Program; // Initialize to undefined, using the input program will incorrectly mark it as stale
        const xml: string[] = [];
        if (opts.sourceTexts) {
            for (let i = 0; i < opts.sourceTexts.length; i++) {
                opts.fileSystem[pxt.MAIN_TS] = opts.sourceTexts[i];
                opts.fileSystem[pxt.MAIN_BLOCKS] = "";

                let newProgram = getTSProgram(opts, programCache);
                const file = newProgram.getSourceFile(pxt.MAIN_TS);
                const bresp = pxtc.decompiler.decompileToBlocks(blocksInfo, file, decompileOpts, renameMap);
                xml.push(bresp.outfiles[pxt.MAIN_BLOCKS]);
                programCache = newProgram;
            }
        }

        return xml;
    }

    export function getTSProgram(opts: CompileOptions, old?: ts.Program) {
        let outfiles: pxt.Map<string> = {};

        let fileText: { [index: string]: string } = {};
        for (let fileName in opts.fileSystem) {
            fileText[normalizePath(fileName)] = opts.fileSystem[fileName];
        }

        let setParentNodes = true
        let options = getTsCompilerOptions(opts)

        let host: CompilerHost = {
            getSourceFile: (fn, v, err) => {
                fn = normalizePath(fn)
                let text = ""
                if (fileText.hasOwnProperty(fn)) {
                    text = fileText[fn]
                } else {
                    if (err) err("File not found: " + fn)
                }
                if (text == null) {
                    err("File not found: " + fn)
                    text = ""
                }
                return createSourceFile(fn, text, v, setParentNodes, undefined /* scriptKind */, options);
            },
            fileExists: fn => {
                fn = normalizePath(fn)
                return fileText.hasOwnProperty(fn)
            },
            getCanonicalFileName: fn => fn,
            getDefaultLibFileName: () => "no-default-lib.d.ts",
            writeFile: (fileName, data, writeByteOrderMark, onError) => {
                outfiles[fileName] = data
            },
            getCurrentDirectory: () => ".",
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\n",
            readFile: fn => {
                fn = normalizePath(fn)
                return fileText[fn] || "";
            },
            directoryExists: dn => true,
            getDirectories: () => []
        }

        if (!opts.sourceFiles)
            opts.sourceFiles = Object.keys(opts.fileSystem)

        let tsFiles = opts.sourceFiles.filter(f => U.endsWith(f, ".ts"))
        // ensure that main.ts is last of TS files
        let tsFilesNoMain = tsFiles.filter(f => f != pxt.MAIN_TS)
        let hasMain = false;
        if (tsFiles.length > tsFilesNoMain.length) {
            tsFiles = tsFilesNoMain
            tsFiles.push(pxt.MAIN_TS)
            hasMain = true;
        }

        // run post-processing code last, if present
        const post_idx = tsFiles.indexOf(pxt.TUTORIAL_CODE_STOP);
        if (post_idx >= 0) {
            tsFiles.splice(post_idx, 1)
            tsFiles.push(pxt.TUTORIAL_CODE_STOP);
        }

        // TODO: ensure that main.ts is last???
        const program = createProgram(tsFiles, options, host, old);
        annotate(program, pxt.MAIN_TS, target || (pxt.appTarget && pxt.appTarget.compile));
        return program;
    }

    function normalizePath(path: string): string {
        path = path.replace(/\\/g, "/");

        const parts: string[] = [];
        path.split("/").forEach(part => {
            if (part === ".." && parts.length) {
                parts.pop();
            }
            else if (part !== ".") {
                parts.push(part)
            }
        });

        return parts.join("/");
    }
}
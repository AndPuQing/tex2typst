import { parseTex } from "./tex-parser";
import { Tex2TypstOptions } from "./types";
import { convertTree, TypstWriter } from "./typst-writer";
import { symbolMap } from "./map";
import { parseTypst } from "./typst-parser";
import { convert_typst_node_to_tex, TexWriter } from "./tex-writer";


export function tex2typst(tex: string, options?: Tex2TypstOptions): string {
    const opt: Tex2TypstOptions = {
        nonStrict: true,
        preferTypstIntrinsic: true,
        keepSpaces: false,
        customTexMacros: {}
    };
    if (options) {
        if (options.nonStrict) {
            opt.nonStrict = options.nonStrict;
        }
        if (options.preferTypstIntrinsic) {
            opt.preferTypstIntrinsic = options.preferTypstIntrinsic;
        }
        if (options.customTexMacros) {
            opt.customTexMacros = options.customTexMacros;
        }
    }
    const texTree = parseTex(tex, opt.customTexMacros!);
    const typstTree = convertTree(texTree);
    const writer = new TypstWriter(opt.nonStrict!, opt.preferTypstIntrinsic!, opt.keepSpaces!);
    writer.serialize(typstTree);
    return writer.finalize();
}

export function typst2tex(typst: string): string {
    const typstTree = parseTypst(typst);
    const texTree = convert_typst_node_to_tex(typstTree);
    const writer = new TexWriter();
    writer.append(texTree);
    return writer.finalize();
}

export { symbolMap, Tex2TypstOptions };

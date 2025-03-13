import { parseTex } from "./tex-parser";
import type { Tex2TypstOptions } from "./types";
import { TypstWriter } from "./typst-writer";
import { convert_tex_node_to_typst, convert_typst_node_to_tex } from "./convert";
import { symbolMap } from "./map";
import { parseTypst } from "./typst-parser";
import { TexWriter } from "./tex-writer";


export function tex2typst(tex: string, options?: Tex2TypstOptions): string {
    const opt: Tex2TypstOptions = {
        nonStrict: true,
        preferTypstIntrinsic: true,
        keepSpaces: false,
        fracToSlash: true,
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
        if (options.fracToSlash !== undefined) {
            opt.fracToSlash = options.fracToSlash;
        }
    }
    const texTree = parseTex(tex, opt.customTexMacros!);
    const typstTree = convert_tex_node_to_typst(texTree, opt);
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

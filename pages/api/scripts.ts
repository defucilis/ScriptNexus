import { PrismaClient } from "@prisma/client";
import ScriptUtils from "lib/ScriptUtils";
import { Script } from "lib/types";
import { NextApiRequest, NextApiResponse } from "next";

const FetchScripts = async (amount: number): Promise<Script[]> => {
    const prisma = new PrismaClient();
    try {
        console.log("Fetching all scripts");
        let scripts = await prisma.script.findMany({
            where: {
                active: true,
            },
            take: amount,
            orderBy: {
                created: "desc",
            },
            include: {
                creator: { select: { name: true } },
                owner: { select: { username: true } },
            },
        });
        if (process.env.NEXT_PUBLIC_SFW_MODE === "true") {
            scripts = scripts.map(script => ScriptUtils.makeScriptSfw(script));
        }
        await prisma.$disconnect();
        return scripts;
    } catch (error) {
        await prisma.$disconnect();
        throw error;
    }
};

export { FetchScripts };

export default async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    try {
        const amount = req.body && req.body.take ? Number(req.body.take) : 16;
        const scripts = await FetchScripts(amount);
        res.status(200);
        res.json(scripts);
    } catch (error) {
        console.error("error fetching scripts - " + error);
        res.json({
            error: { message: error.message },
        });
    }
};

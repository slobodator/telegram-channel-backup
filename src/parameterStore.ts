import {GetParameterCommand, SSMClient} from "@aws-sdk/client-ssm";
import {requireNonNull} from "./util.ts";

const region = String(requireNonNull(process.env.AWS_REGION, 'AWS region'));

/* Parameters hold a flat JSON object of credentials, so every value is a string. */
export type ParameterValue = Record<string, string | undefined>;

export async function fetchParameter(parameterName: string): Promise<ParameterValue> {
    const ssmClient = new SSMClient({
        region: region
    });

    const res = await ssmClient.send(
        new GetParameterCommand({
                Name: parameterName,
                WithDecryption: true
            }
        )
    );

    const value = requireNonNull(res.Parameter?.Value, `parameter ${parameterName}`);

    if (!value) {
        throw new Error(
            `Parameter ${parameterName} is empty`
        );
    }

    return JSON.parse(value) as ParameterValue;
}

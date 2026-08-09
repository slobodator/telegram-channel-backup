import {GetParameterCommand, SSMClient} from "@aws-sdk/client-ssm";
import {requireNonNull} from "./util.js";

const region = String(requireNonNull(process.env.AWS_REGION, 'AWS region'));

export async function fetchParameter(parameterName) {
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

    return JSON.parse(value);
}

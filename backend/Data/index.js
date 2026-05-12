const {
  authenticate,
  jsonResponseWithCorrelation,
  normalizeError,
  preflightResponse,
} = require("../shared/auth");
const { emit, finishRequest, maskDeviceId, startRequest } = require("../shared/logging");
const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");
const Papa = require("papaparse");

async function loadEnergyData() {
  try {
    const accountName = process.env.STORAGE_ACCOUNT_NAME;
    const containerName = process.env.DATASETS_CONTAINER_NAME;

    const client = new BlobServiceClient(
      https://${accountName}.blob.core.windows.net,
      new DefaultAzureCredential()
    );

    const containerClient = client.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient("energy_usage_large.csv"); // replace with your CSV filename

    const downloadResponse = await blobClient.download();
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    const csvText = Buffer.concat(chunks).toString("utf-8");
    const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    return data;
  } catch (error) {
    console.error("Error loading energy data from blob:", error);
    return [];
  }
}

module.exports = async function data(context, req) {
  const request = startRequest(context, req, "/api/data");
  
  if (req.method === "OPTIONS") {
    context.res = preflightResponse(request.correlationId);
    finishRequest(context, request, 204);
    return;
  }

  const allData = await loadEnergyData();

  try {
    const auth = await authenticate(req);
    const { role, device_id } = auth.claims;

    let visibleData;

    if (role === "admin") {
      visibleData = allData;
    } else if (role === "user") {
      if (!device_id) {
        emit(context, "warn", "authz.denied", {
          correlationId: request.correlationId,
          path: "/api/data",
          code: "missing_device_id",
          role,
        });
        context.res = jsonResponseWithCorrelation(
          403,
          {
            error: "No device_id associated with this account",
          },
          request.correlationId
        );
        finishRequest(context, request, 403);
        return;
      }

      const normalizedDeviceId = device_id.trim().toUpperCase();
      visibleData = allData.filter((item) => item.device_id === normalizedDeviceId);
    } else {
      emit(context, "warn", "authz.denied", {
        correlationId: request.correlationId,
        path: "/api/data",
        code: "unknown_role",
        role,
      });
      context.res = jsonResponseWithCorrelation(
        403,
        { error: "Insufficient permissions" },
        request.correlationId
      );
      finishRequest(context, request, 403);
      return;
    }

    emit(context, "info", "authz.allowed", {
      correlationId: request.correlationId,
      path: "/api/data",
      role,
      deviceIdMasked: maskDeviceId(device_id),
      returnedCount: visibleData.length,
    });

    context.res = jsonResponseWithCorrelation(
      200,
      {
        role,
        device_id,
        data: visibleData,
      },
      request.correlationId
    );
    finishRequest(context, request, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    emit(context, normalized.status >= 500 ? "error" : "warn", "auth.failed", {
      correlationId: request.correlationId,
      path: "/api/data",
      code: normalized.code,
      reason: normalized.logMessage,
    });
    context.res = jsonResponseWithCorrelation(
      normalized.status,
      { error: normalized.clientMessage },
      request.correlationId
    );
    finishRequest(context, request, normalized.status);
  }
};
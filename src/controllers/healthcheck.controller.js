import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const healthcheck = asyncHandler(async (req, res) => {
    return res.status(200).json(
        new ApiResponse(200, { 
            status: "OK", 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            message: "Service is running smoothly"
        }, "Health check passed")
    )
})

export { healthcheck }
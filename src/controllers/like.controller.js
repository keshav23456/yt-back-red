import mongoose, {isValidObjectId} from "mongoose"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

// Generic toggle function
const toggleLike = (field) => asyncHandler(async (req, res) => {
    const id = req.params[`${field}Id`]
    
    if (!isValidObjectId(id)) {
        throw new ApiError(400, `Invalid ${field}Id`)
    }

    const query = { [field]: id, likedBy: req.user?._id }
    const existing = await Like.findOne(query)

    if (existing) {
        await Like.findByIdAndDelete(existing._id)
        return res.status(200).json(new ApiResponse(200, { isLiked: false }))
    }

    await Like.create(query)
    return res.status(200).json(new ApiResponse(200, { isLiked: true }))
})

const toggleVideoLike = toggleLike('video')
const toggleCommentLike = toggleLike('comment')
const toggleTweetLike = toggleLike('tweet')

const getLikedVideos = asyncHandler(async (req, res) => {
    const likedVideos = await Like.aggregate([
        { $match: { likedBy: new mongoose.Types.ObjectId(req.user._id) } },
        {
            $lookup: {
                from: "videos",
                localField: "video", 
                foreignField: "_id",
                as: "likedVideo",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id", 
                            as: "ownerDetails"
                        }
                    },
                    { $unwind: "$ownerDetails" }
                ]
            }
        },
        { $unwind: "$likedVideo" },
        { $sort: { createdAt: -1 } },
        {
            $project: {
                _id: 0,
                likedVideo: {
                    _id: 1,
                    "videoFile.url": 1,
                    "thumbnail.url": 1,
                    owner: 1,
                    title: 1,
                    description: 1,
                    views: 1,
                    duration: 1,
                    createdAt: 1,
                    isPublished: 1,
                    ownerDetails: {
                        username: 1,
                        fullName: 1,
                        "avatar.url": 1
                    }
                }
            }
        }
    ])

    res.status(200).json(new ApiResponse(200, likedVideos, "liked videos fetched successfully"))
})

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos }
import mongoose from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const getChannelStats = asyncHandler(async (req, res) => {
    // Get the channel stats like total video views, total subscribers, total videos, total likes etc.
    
    const channelStats = await Video.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "owner",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $group: {
                _id: null,
                totalVideos: { $sum: 1 },
                totalViews: { $sum: "$views" },
                totalLikes: { $sum: { $size: "$likes" } },
                totalSubscribers: { $first: { $size: "$subscribers" } }
            }
        },
        {
            $project: {
                _id: 0,
                totalVideos: 1,
                totalViews: 1,
                totalLikes: 1,
                totalSubscribers: 1
            }
        }
    ])

    // If no videos found, get subscriber count separately
    if (!channelStats?.length) {
        const subscriberCount = await Subscription.countDocuments({
            channel: req.user._id
        })

        return res.status(200).json(
            new ApiResponse(200, {
                totalVideos: 0,
                totalViews: 0,
                totalLikes: 0,
                totalSubscribers: subscriberCount
            }, "Channel stats fetched successfully")
        )
    }

    const stats = channelStats[0]

    return res.status(200).json(
        new ApiResponse(200, stats, "Channel stats fetched successfully")
    )
})

const getChannelVideos = asyncHandler(async (req, res) => {
    // Get all the videos uploaded by the channel
    const { page = 1, limit = 10, sortBy = "createdAt", sortType = "desc" } = req.query

    const videos = await Video.aggregatePaginate(
        Video.aggregate([
            {
                $match: {
                    owner: new mongoose.Types.ObjectId(req.user._id)
                }
            },
            {
                $lookup: {
                    from: "likes",
                    localField: "_id",
                    foreignField: "video",
                    as: "likes"
                }
            },
            {
                $addFields: {
                    likesCount: {
                        $size: "$likes"
                    }
                }
            },
            {
                $sort: {
                    [sortBy]: sortType === "desc" ? -1 : 1
                }
            },
            {
                $project: {
                    _id: 1,
                    videoFile: 1,
                    thumbnail: 1,
                    title: 1,
                    description: 1,
                    duration: 1,
                    views: 1,
                    isPublished: 1,
                    likesCount: 1,
                    createdAt: 1,
                    updatedAt: 1
                }
            }
        ]),
        {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10)
        }
    )

    return res.status(200).json(
        new ApiResponse(200, videos, "Channel videos fetched successfully")
    )
})

export {
    getChannelStats, 
    getChannelVideos
}